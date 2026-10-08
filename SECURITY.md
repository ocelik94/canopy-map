# Security policy

Please report vulnerabilities privately, not in public issues.

Use GitHub's private vulnerability reporting (**Security → Report a vulnerability** in this
repository). Include the affected version, steps to reproduce and the impact. You will get a
reply within a week.

Canopy is self-hosted: operators are responsible for keeping their deployment updated
(`git pull && docker compose up -d --build`), protecting the `.env` file and backups, and using
strong admin passwords.
