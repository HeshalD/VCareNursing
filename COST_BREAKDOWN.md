# VCareNursing — Infrastructure & Hosting Cost Plan

**Prepared:** June 2026  
**Exchange rate used:** ~300 LKR per USD *(verify current rate at time of payment — it fluctuates)*

---

## Overview

This document outlines the hosting infrastructure required to run VCareNursing online, the accounts that need to be set up, and a two-phase cost strategy — starting on a free plan for the first year, then transitioning to a paid production setup as the system grows.

The system is hosted on **Amazon Web Services (AWS)**, in the **Mumbai, India region** — the closest AWS data centre to Sri Lanka, which gives the fastest response times for local users.

---

## Accounts Required Before Going Live

The following accounts must be created before the system can be deployed. All are free to create.

### 1. Amazon Web Services (AWS)
The cloud platform that hosts the application, database, and all uploaded files (staff photos, documents, PDFs).

- **Cost to create:** Free
- **What you need:** A Visa or Mastercard debit or credit card with **international online payments enabled**
- **Action required:** Contact your bank before signing up and ask them to enable international online transactions on your card. AWS will place a **$1 verification charge** (approximately Rs. 300) when you sign up — this is refunded within a few days.
- **Billing:** AWS charges at the end of each calendar month. You do not pay anything upfront.

### 2. GitHub
Where the application code is stored and deployed from.

- **Cost to create:** Free
- **What you need:** An email address

### 3. Google Account (Gmail)
Used to send system emails (confirmations, notifications) at no additional cost.

- **Cost:** Free
- **What you need:** A dedicated Gmail address for the system (e.g. vcarenursing.lk@gmail.com)
- **Note:** Enable **2-Step Verification** on this account and generate an App Password for the system to use

---

## Phase 1 — Free Tier (Months 1 to 12)

Amazon Web Services provides a **12-month free tier** for all new accounts. During this period the core hosting services are provided at no cost, making Year 1 effectively free to run.

### What the Free Tier Covers

| Service | What It Does | Free Allowance |
|---|---|---|
| EC2 (Application Server) | Runs the VCareNursing application | 750 hrs/month — t2.micro server |
| RDS (Database) | Stores all system data | 750 hrs/month — db.t2.micro database |
| EBS (Server Disk) | Storage space on the server | 30 GB |
| S3 (File Storage) | Stores uploaded documents, photos, PDFs | 5 GB |
| Data Transfer | Bandwidth for users accessing the system | 15 GB outbound/month |

### Phase 1 Monthly Cost Summary

| Item | Monthly Cost |
|---|---|
| AWS (all services — free tier) | Rs. 0 |
| Gmail (system emails) | Rs. 0 |
| Domain renewal | Already purchased — no monthly cost |
| CPanel (DNS) | Already acquired — no monthly cost |
| **Total** | **Rs. 0 / month** |

### Free Tier Limitations

- The free server (t2.micro) has 1 GB of RAM. The system will work, but generating PDF reports (salary sheets, statements, quotes) may be slightly slower under heavy simultaneous use. This is acceptable for a launch and early user phase.
- The 5 GB S3 free allowance covers staff photos, NIC scans, and several months of generated PDFs comfortably. It is unlikely to be exceeded in Year 1.
- The free tier applies only to **one new AWS account**. It cannot be reactivated.

---

## Phase 2 — Paid Production (Month 13 Onwards)

After 12 months the free tier expires. At this point the servers are upgraded to properly sized hardware that comfortably handles the full user load, PDF generation, and file storage without performance issues.

### Production Configuration (Mumbai Region)

| Service | Specification | Monthly Cost (USD) | Monthly Cost (LKR) |
|---|---|---|---|
| EC2 Application Server | t3.small — 2 vCPU, 2 GB RAM | $19.86 | Rs. 5,958 |
| EBS Server Disk | 20 GB | $1.92 | Rs. 576 |
| RDS PostgreSQL Database | db.t3.micro — 2 vCPU, 1 GB RAM | $16.79 | Rs. 5,037 |
| RDS Database Storage | 20 GB | $2.76 | Rs. 828 |
| S3 File Storage | ~10 GB + requests | ~$0.50 | ~Rs. 150 |
| Gmail (system emails) | Free | $0.00 | Rs. 0 |
| Bank foreign currency fee (~2.5%) | Applied by your bank on the USD charge | ~$1.03 | ~Rs. 309 |
| **Total** | | **~$42.86** | **~Rs. 12,858** |

### What Changes at the Upgrade

- Server RAM doubles from 1 GB to 2 GB — PDF generation and concurrent usage become noticeably faster
- Database remains the same size — all existing data carries over with no disruption
- S3 file storage charges begin — at typical usage this is under Rs. 200/month
- **No data loss or downtime required** — this is a server size change, not a migration

### Optional: Save ~30% with Reserved Pricing

If the system is expected to run for at least a year, AWS offers 1-year reserved pricing at a significant discount. There is no large upfront payment — just a lower monthly rate.

| Service | Standard (On-Demand) | Reserved (1 Year) | Monthly Saving |
|---|---|---|---|
| EC2 t3.small | $19.86 | ~$13.50 | $6.36 |
| RDS db.t3.micro | $16.79 | ~$11.50 | $5.29 |
| **Monthly total** | **~Rs. 12,858** | **~Rs. 9,150** | **~Rs. 3,700** |

Reserved pricing can be switched to at any point after Phase 1 ends.

---

## Cost Summary — Both Phases

| Phase | Duration | Monthly Cost | Annual Cost |
|---|---|---|---|
| Phase 1 — Free Tier | Year 1 (months 1–12) | Rs. 0 | Rs. 0 |
| Phase 2 — On-Demand | Year 2 onwards | ~Rs. 12,858 | ~Rs. 154,296 |
| Phase 2 — Reserved (recommended) | Year 2 onwards | ~Rs. 9,150 | ~Rs. 109,800 |

---

## Important Notes

1. **Exchange rate:** All LKR figures are calculated at 300 LKR/USD. The actual rate changes daily — verify at the time of payment.
2. **AWS billing is post-paid:** No payment is collected upfront. AWS charges your registered card at the end of each billing month.
3. **Bank card requirement:** Your debit or credit card must have international online transactions enabled before creating the AWS account. This is the most common point of failure — contact your bank beforehand.
4. **Domain and CPanel:** Already purchased and do not contribute to the monthly running cost.
5. **Scaling:** This cost plan is designed for approximately 1,000 registered users and 100 active users at a time. If the user base grows significantly beyond this, server sizes can be increased incrementally — the cost scales proportionally.
6. **No other services required:** Email, SSL certificates, and all supporting infrastructure are covered by the services listed above at no additional cost.
