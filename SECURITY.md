# Security Policy

## Supported Versions

| Version | Supported          |
|---------|-------------------|
| 1.0.x  | :white_check_mark: |
| < 1.0   | :x:               |

## Reporting a Vulnerability

The Frontal CLI team and community take security seriously. We appreciate your efforts to responsibly disclose your findings.

### How to Report

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please send an email to: **security@frontal.dev**

### What to Include

Please include the following information in your report:

- **Type of issue** (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- **Full paths** of source file(s) related to the manifestation of the issue
- **Location** of the affected source code (tag/branch/commit or direct URL)
- **Special configuration** required to reproduce the issue
- **Step-by-step instructions** to reproduce the issue
- **Proof-of-concept or exploit code** (if possible)
- **Impact** of the issue, including how an attacker might exploit it

### Response Timeline

- **Initial response**: Within 48 hours
- **Detailed response**: Within 7 days
- **Resolution**: As soon as possible, typically within 30 days

### Security Measures

We implement the following security measures:

#### Code Security

- **Static analysis**: Automated security scanning on all pull requests
- **Dependency scanning**: Regular scans for vulnerable dependencies
- **Code review**: Security-focused review for all changes
- **Secure coding**: Following OWASP guidelines

#### Infrastructure Security

- **HTTPS**: All communications use TLS encryption
- **API keys**: Secure storage and transmission
- **Access controls**: Principle of least privilege
- **Audit logging**: Comprehensive logging of security events

#### Supply Chain Security

- **Signed releases**: All releases are cryptographically signed
- **Dependency verification**: Verify package integrity
- **Vulnerability monitoring**: Continuous monitoring for new vulnerabilities
- **Automated updates**: Prompt updates for security patches

### Security Best Practices for Users

#### API Key Management

- **Never commit API keys** to version control
- **Use environment variables** for API keys in production
- **Rotate keys regularly** and revoke unused keys
- **Use scoped keys** with minimum required permissions
- **Monitor key usage** and set up alerts

#### Installation Security

- **Verify package integrity** using checksums
- **Use official distribution channels** only
- **Keep dependencies updated** to latest secure versions
- **Review package permissions** before installation

#### Runtime Security

- **Run with least privilege** required for operations
- **Use secure profiles** for different environments
- **Enable audit logging** to track usage
- **Regular security reviews** of configurations

### Common Security Considerations

#### Authentication

- API keys are stored encrypted in `~/.frontal/`
- Keys are never logged or exposed in error messages
- Profile isolation prevents credential leakage
- Secure key rotation is supported

#### Data Protection

- Sensitive data is masked in logs and output
- Temporary files are securely cleaned up
- Network communications use HTTPS only
- Input validation prevents injection attacks

#### Permission Management

- Role-based access control (RBAC) enforcement
- Principle of least privilege applied
- Audit trails for all permission changes
- Secure default configurations

### Vulnerability Disclosure Process

1. **Receipt**: We acknowledge receipt of your report within 48 hours
2. **Validation**: We validate and reproduce the vulnerability
3. **Assessment**: We assess the impact and severity
4. **Remediation**: We develop and test a fix
5. **Deployment**: We deploy the fix to all supported versions
6. **Disclosure**: We coordinate public disclosure with credit

### Security Updates

#### Patch Process

- **Critical**: Immediate patch release (within 72 hours)
- **High**: Patch release within 1 week
- **Medium**: Patch release within 2 weeks
- **Low**: Included in next scheduled release

#### Notification

- **Security advisories** published on GitHub
- **Email notifications** to registered users
- **In-app notifications** for automatic updates
- **Blog posts** for significant security updates

### Security Testing

#### Automated Testing

- **SAST**: Static Application Security Testing
- **DAST**: Dynamic Application Security Testing
- **SCA**: Software Composition Analysis
- **Container scanning**: Docker image security scanning

#### Manual Testing

- **Penetration testing**: Regular security assessments
- **Code reviews**: Security-focused code reviews
- **Threat modeling**: Regular threat analysis
- **Security audits**: Third-party security assessments

### Security Contacts

#### Primary Security Contact

- **Email**: security@frontal.dev
- **PGP Key**: Available on request
- **Response Time**: Within 48 hours

#### Emergency Contacts

For critical security issues requiring immediate attention:

- **Security Lead**: security-lead@frontal.dev
- **CTO**: cto@frontal.dev

### Security Acknowledgments

We thank security researchers and users who help us maintain the security of Frontal CLI. Contributors who report security vulnerabilities will be recognized in our security hall of fame.

### Legal Information

#### Safe Harbor

This security policy is intended to give security researchers clear guidelines for conducting vulnerability discovery activities. We consider activities conducted in accordance with this policy to be authorized.

#### Disclaimer

While we strive to maintain the highest security standards, no software is completely secure. We continuously work to improve security and appreciate community support in this effort.

### Related Resources

- [OWASP Secure Coding Practices](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [NPM Security](https://www.npmjs.com/advisories)
- [GitHub Security Advisories](https://github.com/advisories)

### Security Changelog

Security-related changes are documented in our changelog with the `Security` category and are also published as separate security advisories.

---

Thank you for helping keep Frontal CLI secure!