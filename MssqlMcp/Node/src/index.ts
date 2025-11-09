#!/usr/bin/env node

// External imports
import * as dotenv from "dotenv";
import sql from "mssql";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Internal imports
import { UpdateDataTool } from "./tools/UpdateDataTool.js";
import { InsertDataTool } from "./tools/InsertDataTool.js";
import { ReadDataTool } from "./tools/ReadDataTool.js";
import { CreateTableTool } from "./tools/CreateTableTool.js";
import { CreateIndexTool } from "./tools/CreateIndexTool.js";
import { ListTableTool } from "./tools/ListTableTool.js";
import { DropTableTool } from "./tools/DropTableTool.js";
import { DefaultAzureCredential, InteractiveBrowserCredential } from "@azure/identity";
import { DescribeTableTool } from "./tools/DescribeTableTool.js";

// Load environment variables
dotenv.config();

// MSSQL Database connection configuration
// const credential = new DefaultAzureCredential();

// Globals for connection and token reuse
let globalSqlPool: sql.ConnectionPool | null = null;
let globalAccessToken: string | null = null;
let globalTokenExpiresOn: Date | null = null;

// Function to create SQL config - supports both SQL Server Auth and Azure AD
export async function createSqlConfig(): Promise<{ config: sql.config, token: string, expiresOn: Date }> {
  const authType = process.env.AUTH_TYPE?.toLowerCase() || 'azure';
  const trustServerCertificate = process.env.TRUST_SERVER_CERTIFICATE?.toLowerCase() === 'true';
  const connectionTimeout = process.env.CONNECTION_TIMEOUT ? parseInt(process.env.CONNECTION_TIMEOUT, 10) : 30;
  const encrypt = process.env.ENCRYPT?.toLowerCase() !== 'false'; // Default to true
  const port = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433;

  // SQL Server Authentication (username/password)
  if (authType === 'sql') {
    console.log('Using SQL Server Authentication');
    return {
      config: {
        server: process.env.SERVER_NAME!,
        port: port,
        database: process.env.DATABASE_NAME!,
        user: process.env.DB_USER!,
        password: process.env.DB_PASSWORD!,
        options: {
          encrypt: encrypt,
          trustServerCertificate: trustServerCertificate,
          enableArithAbort: true,
        },
        connectionTimeout: connectionTimeout * 1000, // convert seconds to milliseconds
      },
      token: '', // No token for SQL auth
      expiresOn: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year (doesn't expire)
    };
  }

  // Azure AD Authentication (original behavior)
  console.log('Using Azure Active Directory Authentication');
  const credential = new InteractiveBrowserCredential({
    redirectUri: 'http://localhost'
    // disableAutomaticAuthentication : true
  });
  const accessToken = await credential.getToken('https://database.windows.net/.default');

  return {
    config: {
      server: process.env.SERVER_NAME!,
      database: process.env.DATABASE_NAME!,
      options: {
        encrypt: true,
        trustServerCertificate
      },
      authentication: {
        type: 'azure-active-directory-access-token',
        options: {
          token: accessToken?.token!,
        },
      },
      connectionTimeout: connectionTimeout * 1000, // convert seconds to milliseconds
    },
    token: accessToken?.token!,
    expiresOn: accessToken?.expiresOnTimestamp ? new Date(accessToken.expiresOnTimestamp) : new Date(Date.now() + 30 * 60 * 1000)
  };
}

const updateDataTool = new UpdateDataTool();
const insertDataTool = new InsertDataTool();
const readDataTool = new ReadDataTool();
const createTableTool = new CreateTableTool();
const createIndexTool = new CreateIndexTool();
const listTableTool = new ListTableTool();
const dropTableTool = new DropTableTool();
const describeTableTool = new DescribeTableTool();

const server = new Server(
  {
    name: "mssql-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Read READONLY env variable
const isReadOnly = process.env.READONLY === "true";

// Request handlers

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: isReadOnly
    ? [listTableTool, readDataTool, describeTableTool] // todo: add searchDataTool to the list of tools available in readonly mode once implemented
    : [insertDataTool, readDataTool, describeTableTool, updateDataTool, createTableTool, createIndexTool, dropTableTool, listTableTool], // add all new tools here
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result;
    switch (name) {
      case insertDataTool.name:
        result = await insertDataTool.run(args);
        break;
      case readDataTool.name:
        result = await readDataTool.run(args);
        break;
      case updateDataTool.name:
        result = await updateDataTool.run(args);
        break;
      case createTableTool.name:
        result = await createTableTool.run(args);
        break;
      case createIndexTool.name:
        result = await createIndexTool.run(args);
        break;
      case listTableTool.name:
        result = await listTableTool.run(args);
        break;
      case dropTableTool.name:
        result = await dropTableTool.run(args);
        break;
      case describeTableTool.name:
        if (!args || typeof args.tableName !== "string") {
          return {
            content: [{ type: "text", text: `Missing or invalid 'tableName' argument for describe_table tool.` }],
            isError: true,
          };
        }
        result = await describeTableTool.run(args as { tableName: string });
        break;
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error occurred: ${error}` }],
      isError: true,
    };
  }
});

// Server startup
async function runServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    console.error("Fatal error running server:", error);
    process.exit(1);
  }
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});

// Connect to SQL only when handling a request

async function ensureSqlConnection() {
  const authType = process.env.AUTH_TYPE?.toLowerCase() || 'azure';

  // For SQL Server authentication, we don't need to refresh tokens
  if (authType === 'sql') {
    // If we have a pool and it's connected, reuse it
    if (globalSqlPool && globalSqlPool.connected) {
      return;
    }

    // Otherwise, create a new connection
    const { config } = await createSqlConfig();

    // Close old pool if exists
    if (globalSqlPool && globalSqlPool.connected) {
      await globalSqlPool.close();
    }

    globalSqlPool = await sql.connect(config);
    console.log('Connected to SQL Server using SQL Authentication');
    return;
  }

  // For Azure AD authentication, check token expiry
  if (
    globalSqlPool &&
    globalSqlPool.connected &&
    globalAccessToken &&
    globalTokenExpiresOn &&
    globalTokenExpiresOn > new Date(Date.now() + 2 * 60 * 1000) // 2 min buffer
  ) {
    return;
  }

  // Otherwise, get a new token and reconnect
  const { config, token, expiresOn } = await createSqlConfig();
  globalAccessToken = token;
  globalTokenExpiresOn = expiresOn;

  // Close old pool if exists
  if (globalSqlPool && globalSqlPool.connected) {
    await globalSqlPool.close();
  }

  globalSqlPool = await sql.connect(config);
  console.log('Connected to SQL Server using Azure AD Authentication');
}

// Patch all tool handlers to ensure SQL connection before running
function wrapToolRun(tool: { run: (...args: any[]) => Promise<any> }) {
  const originalRun = tool.run.bind(tool);
  tool.run = async function (...args: any[]) {
    await ensureSqlConnection();
    return originalRun(...args);
  };
}

[insertDataTool, readDataTool, updateDataTool, createTableTool, createIndexTool, dropTableTool, listTableTool, describeTableTool].forEach(wrapToolRun);