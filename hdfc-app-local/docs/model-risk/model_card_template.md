# Model card — {{ run_id }}

## Identity
- Base model: {{ base_model }} ({{ base_model_digest }})
- Adapter: {{ adapter_path }}
- Dataset version: {{ dataset_hash }}
- Code commit: {{ code_commit }}
- Owner: {{ owner }}
- Expiry / re-approval date: {{ expiry_date }}

## Intended use
- Approved tasks: terminology normalization, intent classification, response
  drafting under defined templates, procedural summarization, grounded Q&A.
- Explicitly out of scope: autonomous transaction decisions, customer
  commitments, legal or investment advice.

## Data lineage summary
- Source datasets and purpose approvals: {{ dataset_lineage_summary }}
- De-identification method and verification: {{ deid_summary }}

## Evaluation summary
- Base vs adapted comparison: {{ eval_summary }}
- Critical failures: {{ critical_failures }}
- Gate result: {{ gate_pass }}

## Known limitations
{{ limitations }}

## Residual risks
{{ residual_risks }}

## Monitoring thresholds
{{ monitoring_thresholds }}
