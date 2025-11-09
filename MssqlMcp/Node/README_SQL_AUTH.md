# MCP Server - SQL Server Authentication Setup

This guide explains how to configure the MCP server to use SQL Server authentication (username/password) instead of Azure AD authentication.

## Configuration

### 1. Environment Variables (.env file)

The `.env` file has been created with your database credentials:

```env
# SQL Server Configuration
SERVER_NAME=
DATABASE_NAME=
DB_USER=
DB_PASSWORD=
DB_PORT=

# Authentication Type
# Options: 'sql' (SQL Server Authentication) or 'azure' (Azure AD Authentication)
AUTH_TYPE=sql

# Connection Options
TRUST_SERVER_CERTIFICATE=true
CONNECTION_TIMEOUT=30
READONLY=false

# Encryption
ENCRYPT=true
```

### 2. Build the Project

After modifying the configuration, rebuild the project:

```bash
cd SQL-AI-samples/MssqlMcp/Node
npm run build
```

### 3. Test the Connection

You can test the MCP server by running it directly:

```bash
node dist/index.js
```

## Modified Files

The following file has been modified to support SQL Server authentication:

- `src/index.ts` - Added support for SQL Server authentication alongside Azure AD

### Key Changes:

1. **Added `.env` file loading** - Uses `dotenv` to load environment variables
2. **AUTH_TYPE parameter** - Set to `'sql'` for SQL Server auth or `'azure'` for Azure AD
3. **SQL Server authentication** - Uses username/password when `AUTH_TYPE=sql`
4. **Connection pooling** - Maintains persistent connection for SQL auth (no token refresh needed)


## Usage with Backend

Your backend is configured to connect to the MCP server at:
```
MCP_TOOL_URL=http://localhost:5000
```

Make sure the MCP server is running before starting your backend.

## Troubleshooting

### Connection Failed

**Issue**: Cannot connect to SQL Server

**Solutions**:
1. Verify SQL Server is accessible from your machine
2. Check firewall rules allow port 1433
3. Verify credentials are correct
4. Try setting `TRUST_SERVER_CERTIFICATE=true` if using self-signed certificates

### Authentication Error

**Issue**: Login failed for user

**Solutions**:
1. Verify `DB_USER` and `DB_PASSWORD` are correct
2. Ensure SQL Server authentication is enabled (not just Windows auth)
3. Check user has permissions on the database

### Certificate Error

**Issue**: Certificate validation failed

**Solution**: Set `TRUST_SERVER_CERTIFICATE=true` in `.env`

## Testing the Setup

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Run the MCP server**:
   ```bash
   node dist/index.js
   ```

3. **In another terminal, test with backend**:
   ```bash
   cd ../../backend
   npm start
   ```


## Security Notes

- ⚠️ **Never commit the `.env` file** to version control
- ✅ Use strong passwords for database users
- ✅ Consider using read-only credentials if you don't need write access
- ✅ Enable encryption (`ENCRYPT=true`) for production
- ✅ Use `READONLY=true` if you only need read access

## Switching Back to Azure AD

To switch back to Azure AD authentication:

1. Change `AUTH_TYPE=azure` in `.env`
2. Remove or comment out `DB_USER` and `DB_PASSWORD`
3. Rebuild: `npm run build`
4. Restart the server

## Next Steps

1. ✅ Build the MCP server: `npm run build`
2. ✅ Start the MCP server: `node dist/index.js`
3. ✅ Start your backend: `cd ../../backend && npm start`
4. ✅ Try asking a question via the `/ask` endpoint

---

**Status**: ✅ Configured for SQL Server Authentication

