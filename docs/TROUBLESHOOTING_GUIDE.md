# Troubleshooting Guide

This guide covers common issues and solutions when using the Frontal CLI.

## Getting Help

### Command Help

For any command, use the `--help` flag:

```bash
frontal --help
frontal <command> --help
frontal <command> <subcommand> --help
```

### Debug Mode

Enable debug mode for detailed troubleshooting information:

```bash
frontal <command> --debug
```

### Verbose Output

Get more detailed output:

```bash
frontal <command> --verbose
```

## Installation Issues

### Command Not Found

**Problem:** `frontal: command not found`

**Solutions:**

1. **Check Installation:**
   ```bash
   npm list -g frontal-cli
   ```

2. **Verify PATH:**
   ```bash
   echo $PATH | grep -o '[^:]*npm[^:]*'
   ```

3. **Add npm global bin to PATH:**
   ```bash
   export PATH=$(npm config get prefix)/bin:$PATH
   ```

4. **Reinstall:**
   ```bash
   npm uninstall -g frontal-cli
   npm install -g frontal-cli
   ```

### Permission Denied

**Problem:** `EACCES: permission denied`

**Solutions:**

1. **Fix npm permissions:**
   ```bash
   npm config set prefix ~/.npm-global
   export PATH=~/.npm-global/bin:$PATH
   ```

2. **Use npx (no global install):**
   ```bash
   npx frontal-cli <command>
   ```

3. **Use sudo (not recommended):**
   ```bash
   sudo npm install -g frontal-cli
   ```

### Network Issues

**Problem:** Installation fails due to network issues

**Solutions:**

1. **Check internet connection:**
   ```bash
   curl -I https://registry.npmjs.org/
   ```

2. **Use different registry:**
   ```bash
   npm install -g frontal-cli --registry https://registry.npmjs.org/
   ```

3. **Configure proxy:**
   ```bash
   npm config set proxy http://proxy.company.com:8080
   npm config set https-proxy http://proxy.company.com:8080
   ```

## Authentication Issues

### Invalid API Key

**Problem:** `Error: Invalid API key`

**Solutions:**

1. **Verify API key format:**
   - Should start with `frt_`
   - Check for extra spaces or characters

2. **Test API key manually:**
   ```bash
   curl -H "Authorization: Bearer frt_your_key" https://api.frontal.dev/v1/orgs
   ```

3. **Re-authenticate:**
   ```bash
   frontal auth login --profile <profile-name>
   ```

4. **Check API key status in web console**

### Authentication Timeout

**Problem:** Connection timeout during authentication

**Solutions:**

1. **Check network connectivity:**
   ```bash
   ping api.frontal.dev
   ```

2. **Increase timeout:**
   ```bash
   frontal config set http.timeout 60000
   ```

3. **Use different API URL:**
   ```bash
   frontal auth login
   # Enter alternative URL when prompted
   ```

### Profile Not Found

**Problem:** `Error: Profile 'staging' not found`

**Solutions:**

1. **List available profiles:**
   ```bash
   frontal config list-profiles
   ```

2. **Create missing profile:**
   ```bash
   frontal auth login --profile staging
   ```

3. **Switch to valid profile:**
   ```bash
   frontal config use-profile default
   ```

## Configuration Issues

### Invalid Configuration

**Problem:** `Error: Invalid configuration value`

**Solutions:**

1. **Validate configuration:**
   ```bash
   frontal config validate
   ```

2. **Check syntax:**
   ```bash
   frontal config list
   ```

3. **Reset to defaults:**
   ```bash
   frontal config reset
   ```

4. **Manual inspection:**
   ```bash
   cat ~/.frontal/config.json
   ```

### Permission Denied on Config

**Problem:** Cannot write configuration files

**Solutions:**

1. **Check permissions:**
   ```bash
   ls -la ~/.frontal/
   ```

2. **Fix permissions:**
   ```bash
   chmod 755 ~/.frontal/
   chmod 644 ~/.frontal/config.json
   ```

3. **Check disk space:**
   ```bash
   df -h
   ```

## Command Execution Issues

### Resource Not Found

**Problem:** `Error: Resource not found`

**Solutions:**

1. **Verify resource ID:**
   ```bash
   frontal functions list
   frontal functions info <correct-id>
   ```

2. **Check context:**
   ```bash
   frontal config list
   frontal orgs use <correct-org>
   frontal workspaces use <correct-workspace>
   ```

3. **Use correct resource type:**
   ```bash
   # Check if it's a function or container
   frontal functions list
   frontal containers list
   ```

### Permission Denied

**Problem:** `Error: Access denied`

**Solutions:**

1. **Check current user permissions:**
   ```bash
   frontal auth status
   ```

2. **Verify organization membership:**
   ```bash
   frontal orgs list
   ```

3. **Check team membership:**
   ```bash
   frontal teams list
   ```

4. **Contact admin for required permissions**

### Validation Errors

**Problem:** `Error: Validation failed`

**Solutions:**

1. **Check required fields:**
   ```bash
   frontal <command> --help
   ```

2. **Verify input format:**
   ```bash
   # Use JSON for complex inputs
   frontal functions create --config-file config.json
   ```

3. **Check file paths:**
   ```bash
   ls -la <file-path>
   frontal functions deploy ./my-function
   ```

## Network and Connectivity Issues

### Connection Timeout

**Problem:** Requests timing out

**Solutions:**

1. **Increase timeout:**
   ```bash
   frontal config set http.timeout 60000
   ```

2. **Check network:**
   ```bash
   curl -I https://api.frontal.dev/v1
   ```

3. **Use different endpoint:**
   ```bash
   frontal --api-url https://api-alt.frontal.dev/v1 <command>
   ```

### SSL Certificate Issues

**Problem:** SSL certificate validation errors

**Solutions:**

1. **Update certificates:**
   ```bash
   # On macOS
   brew update && brew upgrade
   
   # On Linux
   sudo apt-get update && sudo apt-get install ca-certificates
   ```

2. **Temporarily disable validation (not recommended for production):**
   ```bash
   export NODE_TLS_REJECT_UNAUTHORIZED=0
   frontal <command>
   ```

3. **Use custom CA bundle:**
   ```bash
   export NODE_EXTRA_CA_CERTS=/path/to/ca-bundle.crt
   frontal <command>
   ```

### Proxy Issues

**Problem:** Cannot connect through proxy

**Solutions:**

1. **Configure proxy:**
   ```bash
   export HTTP_PROXY=http://proxy.company.com:8080
   export HTTPS_PROXY=http://proxy.company.com:8080
   ```

2. **Configure npm proxy:**
   ```bash
   npm config set proxy http://proxy.company.com:8080
   npm config set https-proxy http://proxy.company.com:8080
   ```

3. **Bypass proxy for local addresses:**
   ```bash
   export NO_PROXY=localhost,127.0.0.1
   ```

## Deployment Issues

### Function Deployment Fails

**Problem:** `Error: Function deployment failed`

**Solutions:**

1. **Check function code:**
   ```bash
   # Verify syntax
   node -c my-function.js
   
   # Check required exports
   grep "exports.handler" my-function.js
   ```

2. **Verify runtime compatibility:**
   ```bash
   frontal functions create --runtime nodejs18
   ```

3. **Check file size limits:**
   ```bash
   du -h my-function.zip
   ```

4. **View deployment logs:**
   ```bash
   frontal functions logs <function-id> --tail
   ```

### Container Deployment Issues

**Problem:** Container deployment fails

**Solutions:**

1. **Verify image:**
   ```bash
   docker pull nginx:latest
   docker run -p 80:80 nginx:latest
   ```

2. **Check image size:**
   ```bash
   docker images nginx
   ```

3. **Verify port configuration:**
   ```bash
   frontal containers create --image nginx:latest --port 80
   ```

4. **Check resource limits:**
   ```bash
   frontal containers info <container-id>
   ```

## Performance Issues

### Slow Commands

**Problem:** Commands take too long to execute

**Solutions:**

1. **Enable debug mode to identify bottlenecks:**
   ```bash
   frontal <command> --debug
   ```

2. **Reduce output:**
   ```bash
   frontal <command> --output json --quiet
   ```

3. **Use pagination:**
   ```bash
   frontal functions list --limit 10
   ```

4. **Filter results:**
   ```bash
   frontal functions list --status active
   ```

### Memory Issues

**Problem:** CLI runs out of memory

**Solutions:**

1. **Increase Node.js memory limit:**
   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   frontal <command>
   ```

2. **Process results in batches:**
   ```bash
   frontal functions list --limit 100
   ```

3. **Use streaming for large outputs:**
   ```bash
   frontal logs tail --since 1h
   ```

## Environment-Specific Issues

### CI/CD Pipeline Issues

**Problem:** Commands fail in CI/CD

**Solutions:**

1. **Check environment variables:**
   ```bash
   echo $FRONTAL_API_KEY
   echo $FRONTAL_ORG
   ```

2. **Use non-interactive mode:**
   ```bash
   frontal functions deploy --no-confirm
   ```

3. **Set appropriate timeouts:**
   ```bash
   frontal config set http.timeout 120000
   ```

4. **Use specific profiles:**
   ```bash
   frontal --profile ci <command>
   ```

### Windows-Specific Issues

**Problem:** Commands behave differently on Windows

**Solutions:**

1. **Use PowerShell instead of Command Prompt:**
   ```powershell
   frontal auth login
   ```

2. **Handle path separators:**
   ```bash
   # Use forward slashes in Git Bash
   frontal functions deploy ./my-function
   
   # Use backslashes in Command Prompt
   frontal functions deploy .\my-function
   ```

3. **Check line endings:**
   ```bash
   # Convert line endings
   dos2unix config.json
   ```

## Debugging Techniques

### Enable Debug Logging

```bash
# Enable debug for all commands
export FRONTAL_DEBUG=true
frontal <command>

# Or use debug flag
frontal <command> --debug
```

### Capture Network Traffic

```bash
# Use curl to test API directly
curl -v -H "Authorization: Bearer $FRONTAL_API_KEY" \
     https://api.frontal.dev/v1/orgs

# Use tcpdump for detailed network analysis
sudo tcpdump -i any host api.frontal.dev
```

### Inspect Configuration

```bash
# Show all configuration
frontal config list --debug

# Check profile configuration
cat ~/.frontal/profiles/default.json

# Validate configuration
frontal config validate
```

### Test with Minimal Configuration

```bash
# Create test profile
frontal auth login --profile test

# Use minimal options
frontal --profile test --output json orgs list
```

## Common Error Messages

### `ECONNREFUSED`

**Cause:** Cannot connect to API server

**Solution:** Check network connectivity and API URL

### `ETIMEDOUT`

**Cause:** Request timeout

**Solution:** Increase timeout or check network latency

### `401 Unauthorized`

**Cause:** Invalid or missing API key

**Solution:** Re-authenticate with valid API key

### `403 Forbidden`

**Cause:** Insufficient permissions

**Solution:** Check user permissions and resource access

### `404 Not Found`

**Cause:** Resource does not exist

**Solution:** Verify resource ID and context

### `429 Too Many Requests`

**Cause:** Rate limit exceeded

**Solution:** Wait and retry, or implement rate limiting

### `500 Internal Server Error`

**Cause:** Server error

**Solution:** Contact support or try again later

## Getting Support

### Self-Service Resources

1. **Documentation:** Check all available guides
2. **Command Help:** Use `--help` flags
3. **Debug Mode:** Use `--debug` for detailed info
4. **Status Page:** Check platform status

### Contact Support

If issues persist:

1. **Gather Information:**
   ```bash
   frontal --version
   frontal config list
   frontal auth status
   ```

2. **Enable Debug Mode:**
   ```bash
   frontal <failing-command> --debug > debug.log 2>&1
   ```

3. **Create Support Ticket:**
   ```bash
   frontal support create "CLI Issue" \
     --description "Detailed description of the problem" \
     --priority medium
   ```

### Community Resources

- GitHub Issues: Report bugs and feature requests
- Community Forum: Get help from other users
- Documentation: Check for updates and new features

## Prevention Tips

### Best Practices

1. **Keep CLI Updated:**
   ```bash
   npm update -g frontal-cli
   ```

2. **Use Profiles for Different Environments**
3. **Validate Configuration Regularly**
4. **Test Commands in Development First**
5. **Monitor Rate Limits**
6. **Use Appropriate Timeouts**
7. **Enable Logging for Troubleshooting**

### Regular Maintenance

1. **Clean up old profiles:**
   ```bash
   frontal config list-profiles
   frontal config remove-profile <old-profile>
   ```

2. **Update API keys regularly**
3. **Review and update configuration**
4. **Monitor usage and limits**

## Next Steps

- [Review installation guide](./installation.md)
- [Check authentication setup](./authentication.md)
- [Explore configuration options](./configuration.md)
- [Browse command reference](./command_reference.md)
