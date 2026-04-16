## 2024-04-16 - Prevent Command Injection with execFile
**Vulnerability:** Command injection when interpolating untrusted input (e.g. `filePath`) directly into the shell string for `child_process.exec` calls.
**Learning:** By default, `exec` evaluates arguments using the system shell, making variables passed directly to the string a vector for injection. This architecture relies on avoiding `exec` entirely for dynamic tasks where arguments come from parameters.
**Prevention:** Replace `child_process.exec` with `child_process.execFile`, which runs an executable directly passing args as an array without utilizing a shell, effectively mitigating any shell metacharacters from user input.
