---
name: devops-infrastructure
description: >-
  Managing cloud resources using Terraform, CDK, or Pulumi.
---

# Infrastructure as Code (IaC)

> **Category**: DevOps & Deployment
> **Tags**: Terraform, AWS, IaC

## Policy

```
Rule: Everything in Code
Description: Server configuration belongs in git alongside application code.
1. No click-ops: Never provision or modify a production AWS/GCP resource manually via the Cloud web dashboard. Write it in Terraform.
2. Version control: Checked-in IaC files provide an explicit changelog of the network, database, and scaling configuration over time.
3. Reusability: Using IaC allows you to spin up identical isolated sandbox or staging environments by simply changing the 'environment_name' variable.
4. State management: Store Terraform state files securely in an encrypted, versioned remote backend (like an S3 bucket with DynamoDB locking).
5. Least privilege roles: Define IAM roles natively in the IaC configuration tightly scoped exactly to the needs of the corresponding service.
```
