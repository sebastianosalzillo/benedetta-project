# Code Review Skill

## Description
Perform automated code review on provided code snippets or files, identifying potential issues, bugs, security vulnerabilities, and best practices violations.

## Triggers
- User requests code review
- Code snippets are provided for analysis
- Files are shared for review
- "review this code" or "check my code"

## Workflow
1. Analyze the provided code for syntax errors
2. Check for common bugs and anti-patterns
3. Identify security vulnerabilities
4. Verify adherence to best practices
5. Provide detailed feedback with severity levels
6. Suggest fixes and improvements

## Output Format
- Issues categorized by severity (Critical, High, Medium, Low)
- Line numbers and code snippets for each issue
- Clear explanations and suggested fixes
- Overall assessment and recommendations

## Implementation
Use static analysis techniques to scan code for:
- Unused variables
- Potential null pointer exceptions
- Security issues (XSS, SQL injection, etc.)
- Performance problems
- Code style violations
- Logic errors

## Limitations
- Cannot execute code
- Limited to static analysis
- Language-specific checks based on supported languages
- May produce false positives