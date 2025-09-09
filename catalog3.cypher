// =================================================================
// COMPLETE SCRIPT - BANKING & INSURANCE WITH DEPARTMENTS (v4 - REVISED)
// This version reflects an updated data model where:
// 1. Projects are not directly linked to Sectors/Departments.
// 2. Projects depend on Modules, not Sub-Modules.
// 3. Roles are required by Modules, not Projects.
// -- MODIFIED: Removed all ProjectBlueprint nodes and relationships.
// =================================================================

// Clear existing graph for a clean run (Optional)
// MATCH (n) DETACH DELETE n;

// =================================================================
// SECTION 1: CREATE CORE ENTITIES
// =================================================================

// --- CREATE INDUSTRIES ---
MERGE (b:Industry {name: 'Banking'})
MERGE (i:Industry {name: 'Insurance'});

// --- CREATE SECTORS ---
MERGE (rb:Sector {name: 'Retail Banking'})
MERGE (cb:Sector {name: 'Commercial Banking'})
MERGE (ib:Sector {name: 'Investment Banking'})
MERGE (pb:Sector {name: 'Private Banking'})
MERGE (cu:Sector {name: 'Credit Unions'})
MERGE (ob:Sector {name: 'Online Banking'})
MERGE (li:Sector {name: 'Life Insurance'})
MERGE (hi:Sector {name: 'Health Insurance'})
MERGE (pi:Sector {name: 'Property Insurance'})
MERGE (ci:Sector {name: 'Casualty Insurance'});

// --- CREATE ROLES ---
MERGE (ds:Role {name: 'Data Scientist'})
MERGE (ai:Role {name: 'AI Engineer'})
MERGE (devops:Role {name: 'DevOps Engineer'})
MERGE (mlOps:Role {name: 'MLOps Engineer'});

// --- CREATE PAIN POINTS ---
MERGE (pp_loan_risk:PainPoint {name: 'Inaccurate Loan Default Prediction'})
MERGE (pp_cc_fraud:PainPoint {name: 'High-Volume Transaction Fraud'})
MERGE (pp_claim_fraud:PainPoint {name: 'Fraudulent & Inflated Claims'})
MERGE (pp_cust_churn:PainPoint {name: 'High Customer Churn Rate'})
MERGE (pp_call_volume:PainPoint {name: 'Overloaded Call Center Staff'})
MERGE (pp_slow_claims:PainPoint {name: 'Slow & Manual Claims Processing'})
MERGE (pp_health_fraud:PainPoint {name: 'Upcoding & Service Unbundling Fraud'});

// --- CREATE MODULES ---
MERGE (mod_fd:Module {name: 'Fraud Detection Core Modules'})
MERGE (mod_cs:Module {name: 'Customer Service Core Modules'})
MERGE (mod_cl:Module {name: 'Claims Processing Core Modules'})
MERGE (mod_cr:Module {name: 'Credit Scoring Core Modules'});

// --- CREATE SUB-MODULES ---
// Sub-Modules for Fraud Detection
MERGE (sm_fd_a:SubModule {name: "Streaming Data Ingestion Layer"})
MERGE (sm_fd_b:SubModule {name: "Rule-Based Engine Upgrade"})
MERGE (sm_fd_c:SubModule {name: "Anomaly Detection Model"})
MERGE (sm_fd_d:SubModule {name: "Alert Prioritization & Explainability"});

// Sub-Modules for Customer Service
MERGE (sm_cs_a:SubModule {name: "Chatbot for FAQs"})
MERGE (sm_cs_b:SubModule {name: "Virtual Assistant for Transactions"})
MERGE (sm_cs_c:SubModule {name: "Sentiment Analysis & Escalation"})
MERGE (sm_cs_d:SubModule {name: "Agent Assist Tools"});

// Sub-Modules for Claims Processing
MERGE (sm_cl_a:SubModule {name: "Claims Intake Portal"})
MERGE (sm_cl_b:SubModule {name: "OCR & Document Processing"})
MERGE (sm_cl_c:SubModule {name: "Claims Triage & Routing"})
MERGE (sm_cl_d:SubModule {name: "Assessment Models"});

// Sub-Modules for Credit Scoring
MERGE (sm_cr_a:SubModule {name: "Data Foundation & Integration"})
MERGE (sm_cr_b:SubModule {name: "Feature Engineering Module"})
MERGE (sm_cr_c:SubModule {name: "Credit Scoring Model (Baseline)"})
MERGE (sm_cr_d:SubModule {name: "Fairness & Bias Mitigation Layer"});

// =================================================================
// SECTION 2: CREATE DEPARTMENT ENTITIES
// =================================================================

// --- CREATE DEPARTMENTS ---
MERGE (dept_mkt:Department {name: 'Marketing'})
MERGE (dept_hr:Department {name: 'Human Resources'})
MERGE (dept_fin:Department {name: 'Finance'})
MERGE (dept_it:Department {name: 'IT'})
MERGE (dept_ops:Department {name: 'Operations'})
MERGE (dept_risk:Department {name: 'Risk & Compliance'});

// --- CREATE DEPARTMENT-SPECIFIC PAIN POINTS ---
// Marketing Pain Points
MERGE (pp_cross_sell:PainPoint {name: 'Ineffective Cross-Sell/Up-Sell', impact: 'Missing 70% of expansion opportunities'})
MERGE (pp_attribution:PainPoint {name: 'Poor Marketing Attribution', impact: 'Cannot trace campaign ROI'})
MERGE (pp_generic_comm:PainPoint {name: 'Generic Customer Communications', impact: '2% response rate'})

// HR Pain Points
MERGE (pp_turnover:PainPoint {name: 'High First-Year Turnover', impact: '40% leave within 12 months'})
MERGE (pp_resume_volume:PainPoint {name: 'Overwhelming Resume Volume', impact: '10,000+ applications/month'})
MERGE (pp_biased_reviews:PainPoint {name: 'Biased Performance Reviews', impact: 'Legal risk exposure'})

// Finance Pain Points
MERGE (pp_invoice_manual:PainPoint {name: 'Manual Invoice Processing', impact: '50,000 invoices/month, 15 FTEs'})
MERGE (pp_expense_fraud:PainPoint {name: 'Expense Report Fraud', impact: '3% fraudulent expenses'})
MERGE (pp_forecast_accuracy:PainPoint {name: 'Inaccurate Revenue Forecasting', impact: '15-20% variance'})

// IT Pain Points
MERGE (pp_alert_fatigue:PainPoint {name: 'Security Alert Fatigue', impact: '5,000 daily alerts, 99% false positives'})
MERGE (pp_unplanned_downtime:PainPoint {name: 'Unplanned System Downtime', impact: 'Critical failures without warning'})

// Operations Pain Points
MERGE (pp_handle_time:PainPoint {name: 'Long Call Center Handle Time', impact: '12 min average per call'})
MERGE (pp_qa_sampling:PainPoint {name: 'Limited QA Coverage', impact: 'Only 2% of transactions reviewed'})

// Risk & Compliance Pain Points
MERGE (pp_aml_false_positives:PainPoint {name: 'AML Alert Inefficiency', impact: '95% false positive rate'})
MERGE (pp_reg_tracking:PainPoint {name: 'Manual Regulatory Tracking', impact: '200+ updates yearly'});

// --- CREATE NEW MODULES FOR DEPARTMENT PROJECTS ---
MERGE (mod_nba:Module {name: 'Next Best Action Core'})
MERGE (mod_hr_analytics:Module {name: 'HR Analytics Core'})
MERGE (mod_doc_intel:Module {name: 'Document Intelligence Core'})
MERGE (mod_sec_ops:Module {name: 'Security Operations Core'});

// --- CREATE NEW SUB-MODULES ---
// Sub-modules for Next Best Action
MERGE (sm_nba_a:SubModule {name: 'Customer 360 Data Layer'})
MERGE (sm_nba_b:SubModule {name: 'Propensity Modeling Engine'})
MERGE (sm_nba_c:SubModule {name: 'Recommendation Orchestrator'})
MERGE (sm_nba_d:SubModule {name: 'A/B Testing Framework'});

// Sub-modules for HR Analytics
MERGE (sm_hr_a:SubModule {name: 'Resume Parser & Matcher'})
MERGE (sm_hr_b:SubModule {name: 'Attrition Risk Scorer'})
MERGE (sm_hr_c:SubModule {name: 'Skills Taxonomy Engine'})
MERGE (sm_hr_d:SubModule {name: 'Performance Analytics'});

// Sub-modules for Security Operations
MERGE (sm_secops_a:SubModule {name: "Threat Intelligence Dashboard"})
MERGE (sm_secops_b:SubModule {name: "Automated Incident Response"})
MERGE (sm_secops_c:SubModule {name: "Behavioral Anomaly Detection"})
MERGE (sm_secops_d:SubModule {name: "False Positive Reduction Engine"});

// =================================================================
// SECTION 3: CREATE ALL RELATIONSHIPS
// =================================================================

// --- Link Original Modules to SubModules ---
MATCH (mod_fd:Module {name: 'Fraud Detection Core Modules'})
MATCH (sm_fd_a:SubModule {name: "Streaming Data Ingestion Layer"})
MATCH (sm_fd_b:SubModule {name: "Rule-Based Engine Upgrade"})
MATCH (sm_fd_c:SubModule {name: "Anomaly Detection Model"})
MATCH (sm_fd_d:SubModule {name: "Alert Prioritization & Explainability"})
MERGE (mod_fd)-[:CONTAINS]->(sm_fd_a)
MERGE (mod_fd)-[:CONTAINS]->(sm_fd_b)
MERGE (mod_fd)-[:CONTAINS]->(sm_fd_c)
MERGE (mod_fd)-[:CONTAINS]->(sm_fd_d);

MATCH (mod_cs:Module {name: 'Customer Service Core Modules'})
MATCH (sm_cs_a:SubModule {name: "Chatbot for FAQs"})
MATCH (sm_cs_b:SubModule {name: "Virtual Assistant for Transactions"})
MATCH (sm_cs_c:SubModule {name: "Sentiment Analysis & Escalation"})
MATCH (sm_cs_d:SubModule {name: "Agent Assist Tools"})
MERGE (mod_cs)-[:CONTAINS]->(sm_cs_a)
MERGE (mod_cs)-[:CONTAINS]->(sm_cs_b)
MERGE (mod_cs)-[:CONTAINS]->(sm_cs_c)
MERGE (mod_cs)-[:CONTAINS]->(sm_cs_d);

MATCH (mod_cl:Module {name: 'Claims Processing Core Modules'})
MATCH (sm_cl_a:SubModule {name: "Claims Intake Portal"})
MATCH (sm_cl_b:SubModule {name: "OCR & Document Processing"})
MATCH (sm_cl_c:SubModule {name: "Claims Triage & Routing"})
MATCH (sm_cl_d:SubModule {name: "Assessment Models"})
MERGE (mod_cl)-[:CONTAINS]->(sm_cl_a)
MERGE (mod_cl)-[:CONTAINS]->(sm_cl_b)
MERGE (mod_cl)-[:CONTAINS]->(sm_cl_c)
MERGE (mod_cl)-[:CONTAINS]->(sm_cl_d);

MATCH (mod_cr:Module {name: 'Credit Scoring Core Modules'})
MATCH (sm_cr_a:SubModule {name: "Data Foundation & Integration"})
MATCH (sm_cr_b:SubModule {name: "Feature Engineering Module"})
MATCH (sm_cr_c:SubModule {name: "Credit Scoring Model (Baseline)"})
MATCH (sm_cr_d:SubModule {name: "Fairness & Bias Mitigation Layer"})
MERGE (mod_cr)-[:CONTAINS]->(sm_cr_a)
MERGE (mod_cr)-[:CONTAINS]->(sm_cr_b)
MERGE (mod_cr)-[:CONTAINS]->(sm_cr_c)
MERGE (mod_cr)-[:CONTAINS]->(sm_cr_d);

// --- Link New Modules to SubModules ---
MATCH (mod_nba:Module {name: 'Next Best Action Core'})
MATCH (sm_nba_a:SubModule {name: 'Customer 360 Data Layer'})
MATCH (sm_nba_b:SubModule {name: 'Propensity Modeling Engine'})
MATCH (sm_nba_c:SubModule {name: 'Recommendation Orchestrator'})
MATCH (sm_nba_d:SubModule {name: 'A/B Testing Framework'})
MERGE (mod_nba)-[:CONTAINS]->(sm_nba_a)
MERGE (mod_nba)-[:CONTAINS]->(sm_nba_b)
MERGE (mod_nba)-[:CONTAINS]->(sm_nba_c)
MERGE (mod_nba)-[:CONTAINS]->(sm_nba_d);

MATCH (mod_hr_analytics:Module {name: 'HR Analytics Core'})
MATCH (sm_hr_a:SubModule {name: 'Resume Parser & Matcher'})
MATCH (sm_hr_b:SubModule {name: 'Attrition Risk Scorer'})
MATCH (sm_hr_c:SubModule {name: 'Skills Taxonomy Engine'})
MATCH (sm_hr_d:SubModule {name: 'Performance Analytics'})
MERGE (mod_hr_analytics)-[:CONTAINS]->(sm_hr_a)
MERGE (mod_hr_analytics)-[:CONTAINS]->(sm_hr_b)
MERGE (mod_hr_analytics)-[:CONTAINS]->(sm_hr_c)
MERGE (mod_hr_analytics)-[:CONTAINS]->(sm_hr_d);

MATCH (mod_doc_intel:Module {name: 'Document Intelligence Core'})
MATCH (sm_cl_b:SubModule {name: 'OCR & Document Processing'})
MERGE (mod_doc_intel)-[:CONTAINS]->(sm_cl_b);

MATCH (mod_sec_ops:Module {name: 'Security Operations Core'})
MATCH (sm_secops_a:SubModule {name: "Threat Intelligence Dashboard"})
MATCH (sm_secops_b:SubModule {name: "Automated Incident Response"})
MATCH (sm_secops_c:SubModule {name: "Behavioral Anomaly Detection"})
MATCH (sm_secops_d:SubModule {name: "False Positive Reduction Engine"})
MERGE (mod_sec_ops)-[:CONTAINS]->(sm_secops_a)
MERGE (mod_sec_ops)-[:CONTAINS]->(sm_secops_b)
MERGE (mod_sec_ops)-[:CONTAINS]->(sm_secops_c)
MERGE (mod_sec_ops)-[:CONTAINS]->(sm_secops_d);

// --- Link Industries to Sectors ---
MATCH (b:Industry {name: 'Banking'})
MATCH (rb:Sector {name: 'Retail Banking'})
MATCH (cb:Sector {name: 'Commercial Banking'})
MATCH (ib:Sector {name: 'Investment Banking'})
MATCH (pb:Sector {name: 'Private Banking'})
MATCH (cu:Sector {name: 'Credit Unions'})
MATCH (ob:Sector {name: 'Online Banking'})
MERGE (b)-[:HAS_SECTOR]->(rb)
MERGE (b)-[:HAS_SECTOR]->(cb)
MERGE (b)-[:HAS_SECTOR]->(ib)
MERGE (b)-[:HAS_SECTOR]->(pb)
MERGE (b)-[:HAS_SECTOR]->(cu)
MERGE (b)-[:HAS_SECTOR]->(ob);

MATCH (i:Industry {name: 'Insurance'})
MATCH (li:Sector {name: 'Life Insurance'})
MATCH (hi:Sector {name: 'Health Insurance'})
MATCH (pi:Sector {name: 'Property Insurance'})
MATCH (ci:Sector {name: 'Casualty Insurance'})
MERGE (i)-[:HAS_SECTOR]->(li)
MERGE (i)-[:HAS_SECTOR]->(hi)
MERGE (i)-[:HAS_SECTOR]->(pi)
MERGE (i)-[:HAS_SECTOR]->(ci);

// --- Link Sectors to Original Pain Points ---
MATCH (rb:Sector {name: 'Retail Banking'})
MATCH (pp_loan_risk:PainPoint {name: 'Inaccurate Loan Default Prediction'})
MATCH (pp_cc_fraud:PainPoint {name: 'High-Volume Transaction Fraud'})
MATCH (pp_call_volume:PainPoint {name: 'Overloaded Call Center Staff'})
MERGE (rb)-[:EXPERIENCES]->(pp_loan_risk)
MERGE (rb)-[:EXPERIENCES]->(pp_cc_fraud)
MERGE (rb)-[:EXPERIENCES]->(pp_call_volume);

MATCH (ob:Sector {name: 'Online Banking'})
MATCH (pp_cc_fraud:PainPoint {name: 'High-Volume Transaction Fraud'})
MERGE (ob)-[:EXPERIENCES]->(pp_cc_fraud);

MATCH (cb:Sector {name: 'Commercial Banking'})
MATCH (pp_loan_risk:PainPoint {name: 'Inaccurate Loan Default Prediction'})
MERGE (cb)-[:EXPERIENCES]->(pp_loan_risk);

MATCH (pi:Sector {name: 'Property Insurance'})
MATCH (pp_claim_fraud:PainPoint {name: 'Fraudulent & Inflated Claims'})
MATCH (pp_slow_claims:PainPoint {name: 'Slow & Manual Claims Processing'})
MERGE (pi)-[:EXPERIENCES]->(pp_claim_fraud)
MERGE (pi)-[:EXPERIENCES]->(pp_slow_claims);

MATCH (hi:Sector {name: 'Health Insurance'})
MATCH (pp_health_fraud:PainPoint {name: 'Upcoding & Service Unbundling Fraud'})
MATCH (pp_slow_claims:PainPoint {name: 'Slow & Manual Claims Processing'})
MERGE (hi)-[:EXPERIENCES]->(pp_health_fraud)
MERGE (hi)-[:EXPERIENCES]->(pp_slow_claims);

MATCH (li:Sector {name: 'Life Insurance'})
MATCH (pp_claim_fraud:PainPoint {name: 'Fraudulent & Inflated Claims'})
MERGE (li)-[:EXPERIENCES]->(pp_claim_fraud);

// --- Link Departments to Pain Points ---
MATCH (dept_mkt:Department {name: 'Marketing'})
MATCH (pp_cross_sell:PainPoint {name: 'Ineffective Cross-Sell/Up-Sell'})
MATCH (pp_attribution:PainPoint {name: 'Poor Marketing Attribution'})
MATCH (pp_generic_comm:PainPoint {name: 'Generic Customer Communications'})
MERGE (dept_mkt)-[:EXPERIENCES]->(pp_cross_sell)
MERGE (dept_mkt)-[:EXPERIENCES]->(pp_attribution)
MERGE (dept_mkt)-[:EXPERIENCES]->(pp_generic_comm);

MATCH (dept_hr:Department {name: 'Human Resources'})
MATCH (pp_turnover:PainPoint {name: 'High First-Year Turnover'})
MATCH (pp_resume_volume:PainPoint {name: 'Overwhelming Resume Volume'})
MATCH (pp_biased_reviews:PainPoint {name: 'Biased Performance Reviews'})
MERGE (dept_hr)-[:EXPERIENCES]->(pp_turnover)
MERGE (dept_hr)-[:EXPERIENCES]->(pp_resume_volume)
MERGE (dept_hr)-[:EXPERIENCES]->(pp_biased_reviews);

MATCH (dept_fin:Department {name: 'Finance'})
MATCH (pp_invoice_manual:PainPoint {name: 'Manual Invoice Processing'})
MATCH (pp_expense_fraud:PainPoint {name: 'Expense Report Fraud'})
MATCH (pp_forecast_accuracy:PainPoint {name: 'Inaccurate Revenue Forecasting'})
MERGE (dept_fin)-[:EXPERIENCES]->(pp_invoice_manual)
MERGE (dept_fin)-[:EXPERIENCES]->(pp_expense_fraud)
MERGE (dept_fin)-[:EXPERIENCES]->(pp_forecast_accuracy);

MATCH (dept_it:Department {name: 'IT'})
MATCH (pp_alert_fatigue:PainPoint {name: 'Security Alert Fatigue'})
MATCH (pp_unplanned_downtime:PainPoint {name: 'Unplanned System Downtime'})
MERGE (dept_it)-[:EXPERIENCES]->(pp_alert_fatigue)
MERGE (dept_it)-[:EXPERIENCES]->(pp_unplanned_downtime);

MATCH (dept_ops:Department {name: 'Operations'})
MATCH (pp_handle_time:PainPoint {name: 'Long Call Center Handle Time'})
MATCH (pp_qa_sampling:PainPoint {name: 'Limited QA Coverage'})
MERGE (dept_ops)-[:EXPERIENCES]->(pp_handle_time)
MERGE (dept_ops)-[:EXPERIENCES]->(pp_qa_sampling);

MATCH (dept_risk:Department {name: 'Risk & Compliance'})
MATCH (pp_aml_false_positives:PainPoint {name: 'AML Alert Inefficiency'})
MATCH (pp_reg_tracking:PainPoint {name: 'Manual Regulatory Tracking'})
MERGE (dept_risk)-[:EXPERIENCES]->(pp_aml_false_positives)
MERGE (dept_risk)-[:EXPERIENCES]->(pp_reg_tracking);

// =================================================================
// SECTION 3.5: DUAL LINKING - PAIN POINTS TO BOTH SECTORS & DEPARTMENTS
// =================================================================

MATCH (rb:Sector {name: 'Retail Banking'})
MATCH (pp_cross_sell:PainPoint {name: 'Ineffective Cross-Sell/Up-Sell'})
MERGE (rb)-[:EXPERIENCES]->(pp_cross_sell);

MATCH (ob:Sector {name: 'Online Banking'})
MATCH (pp_cross_sell:PainPoint {name: 'Ineffective Cross-Sell/Up-Sell'})
MERGE (ob)-[:EXPERIENCES]->(pp_cross_sell);

MATCH (cb:Sector {name: 'Commercial Banking'})
MATCH (pp_turnover:PainPoint {name: 'High First-Year Turnover'})
MERGE (cb)-[:EXPERIENCES]->(pp_turnover);

MATCH (ib:Sector {name: 'Investment Banking'})
MATCH (pp_turnover:PainPoint {name: 'High First-Year Turnover'})
MERGE (ib)-[:EXPERIENCES]->(pp_turnover);

MATCH (hi:Sector {name: 'Health Insurance'})
MATCH (pp_invoice_manual:PainPoint {name: 'Manual Invoice Processing'})
MERGE (hi)-[:EXPERIENCES]->(pp_invoice_manual);

MATCH (ob:Sector {name: 'Online Banking'})
MATCH (pp_alert_fatigue:PainPoint {name: 'Security Alert Fatigue'})
MERGE (ob)-[:EXPERIENCES]->(pp_alert_fatigue);

MATCH (hi:Sector {name: 'Health Insurance'})
MATCH (pp_handle_time:PainPoint {name: 'Long Call Center Handle Time'})
MERGE (hi)-[:EXPERIENCES]->(pp_handle_time);

MATCH (li:Sector {name: 'Life Insurance'})
MATCH (pp_handle_time:PainPoint {name: 'Long Call Center Handle Time'})
MERGE (li)-[:EXPERIENCES]->(pp_handle_time);

MATCH (rb:Sector {name: 'Retail Banking'})
MATCH (pp_aml_false_positives:PainPoint {name: 'AML Alert Inefficiency'})
MERGE (rb)-[:EXPERIENCES]->(pp_aml_false_positives);

MATCH (cb:Sector {name: 'Commercial Banking'})
MATCH (pp_aml_false_positives:PainPoint {name: 'AML Alert Inefficiency'})
MERGE (cb)-[:EXPERIENCES]->(pp_aml_false_positives);

MATCH (pb:Sector {name: 'Private Banking'})
MATCH (pp_aml_false_positives:PainPoint {name: 'AML Alert Inefficiency'})
MERGE (pb)-[:EXPERIENCES]->(pp_aml_false_positives);

// =================================================================
// SECTION 3.8: LINK MODULES TO REQUIRED ROLES (NEW SECTION)
// =================================================================
MATCH (ds:Role {name: 'Data Scientist'})
MATCH (ai:Role {name: 'AI Engineer'})
MATCH (devops:Role {name: 'DevOps Engineer'})
MATCH (mlOps:Role {name: 'MLOps Engineer'})

MATCH (mod_cr:Module {name: 'Credit Scoring Core Modules'})
MERGE (mod_cr)-[:REQUIRES_ROLE {specialty: 'Risk Modeling'}]->(ds)
MERGE (mod_cr)-[:REQUIRES_ROLE]->(mlOps);

MATCH (mod_fd:Module {name: 'Fraud Detection Core Modules'})
MERGE (mod_fd)-[:REQUIRES_ROLE]->(ds)
MERGE (mod_fd)-[:REQUIRES_ROLE]->(ai)
MERGE (mod_fd)-[:REQUIRES_ROLE]->(mlOps);

MATCH (mod_cs:Module {name: 'Customer Service Core Modules'})
MERGE (mod_cs)-[:REQUIRES_ROLE]->(ai)
MERGE (mod_cs)-[:REQUIRES_ROLE]->(devops)
MERGE (mod_cs)-[:REQUIRES_ROLE]->(ds);

MATCH (mod_cl:Module {name: 'Claims Processing Core Modules'})
MERGE (mod_cl)-[:REQUIRES_ROLE]->(ai)
MERGE (mod_cl)-[:REQUIRES_ROLE]->(mlOps);

MATCH (mod_nba:Module {name: 'Next Best Action Core'})
MERGE (mod_nba)-[:REQUIRES_ROLE]->(ds)
MERGE (mod_nba)-[:REQUIRES_ROLE]->(mlOps)
MERGE (mod_nba)-[:REQUIRES_ROLE]->(ai);

MATCH (mod_hr_analytics:Module {name: 'HR Analytics Core'})
MERGE (mod_hr_analytics)-[:REQUIRES_ROLE]->(ds)
MERGE (mod_hr_analytics)-[:REQUIRES_ROLE]->(ai);

MATCH (mod_doc_intel:Module {name: 'Document Intelligence Core'})
MERGE (mod_doc_intel)-[:REQUIRES_ROLE]->(ai);

MATCH (mod_sec_ops:Module {name: 'Security Operations Core'})
MERGE (mod_sec_ops)-[:REQUIRES_ROLE]->(ai)
MERGE (mod_sec_ops)-[:REQUIRES_ROLE]->(devops)
MERGE (mod_sec_ops)-[:REQUIRES_ROLE]->(ds);

// =================================================================
// SECTION 4: CREATE PROJECT OPPORTUNITIES (REVISED)
// =================================================================

// --- Original Project Opportunities ---

// **Opportunity 1: Credit Scoring for Retail Banking**
MATCH (pp_loan_risk:PainPoint {name: 'Inaccurate Loan Default Prediction'})
MATCH (mod_cr:Module {name: 'Credit Scoring Core Modules'})
CREATE (opp_rb_cr:ProjectOpportunity {
    title: 'Next-Gen Credit Scoring for Retail Mortgages',
    priority: 'High',
    business_case: 'Improve mortgage approval accuracy and reduce defaults by using alternative data sources and mitigating model bias.'
})
CREATE (opp_rb_cr)-[:ADDRESSES]->(pp_loan_risk)
CREATE (opp_rb_cr)-[:USES_MODULE]->(mod_cr);

// **Opportunity 2: Fraud Detection for Retail Banking**
MATCH (pp_cc_fraud:PainPoint {name: 'High-Volume Transaction Fraud'})
MATCH (mod_fd:Module {name: 'Fraud Detection Core Modules'})
CREATE (opp_rb_fd:ProjectOpportunity {
    title: 'Real-Time Credit Card Fraud Prevention',
    priority: 'High',
    business_case: 'Reduce financial losses from credit card fraud by 25% through real-time transaction analysis.'
})
CREATE (opp_rb_fd)-[:ADDRESSES]->(pp_cc_fraud)
CREATE (opp_rb_fd)-[:USES_MODULE]->(mod_fd);

// **Opportunity 3: Customer Service for Retail Banking**
MATCH (pp_call_volume:PainPoint {name: 'Overloaded Call Center Staff'})
MATCH (mod_cs:Module {name: 'Customer Service Core Modules'})
CREATE (opp_rb_cs:ProjectOpportunity {
    title: 'AI-Powered Omnichannel Customer Service Assistant',
    priority: 'Medium',
    business_case: 'Reduce call center volume by 30% and improve first-call resolution by automating common queries and empowering agents.'
})
CREATE (opp_rb_cs)-[:ADDRESSES]->(pp_call_volume)
CREATE (opp_rb_cs)-[:USES_MODULE]->(mod_cs);

// **Opportunity 4: Claims Processing for Property Insurance**
MATCH (pp_slow_claims:PainPoint {name: 'Slow & Manual Claims Processing'})
MATCH (pp_claim_fraud:PainPoint {name: 'Fraudulent & Inflated Claims'})
MATCH (mod_cl:Module {name: 'Claims Processing Core Modules'})
CREATE (opp_pi_cl:ProjectOpportunity {
    title: 'Automated Property Claims Processing',
    priority: 'High',
    business_case: 'Reduce average claims processing time by 50% and automate fraudulent claim flags using document analysis.'
})
CREATE (opp_pi_cl)-[:ADDRESSES]->(pp_slow_claims)
CREATE (opp_pi_cl)-[:ADDRESSES]->(pp_claim_fraud)
CREATE (opp_pi_cl)-[:USES_MODULE]->(mod_cl);

// --- Department-Focused Project Opportunities ---

// **Marketing Project for Retail Banking**
MATCH (pp_cross_sell:PainPoint {name: 'Ineffective Cross-Sell/Up-Sell'})
MATCH (mod_nba:Module {name: 'Next Best Action Core'})
CREATE (opp_rb_nba:ProjectOpportunity {
    title: 'Next Best Action for Retail Banking Products',
    priority: 'High',
    business_case: 'Increase product penetration by 40% through AI-driven recommendations at every customer touchpoint.',
    budget_range: '$2-3M',
    duration: '6 months'
})
CREATE (opp_rb_nba)-[:ADDRESSES]->(pp_cross_sell)
CREATE (opp_rb_nba)-[:USES_MODULE]->(mod_nba);

// **HR Project for Commercial Banking**
MATCH (pp_turnover:PainPoint {name: 'High First-Year Turnover'})
MATCH (mod_hr_analytics:Module {name: 'HR Analytics Core'})
CREATE (opp_cb_churn:ProjectOpportunity {
    title: 'Relationship Manager Retention Analytics',
    priority: 'High',
    business_case: 'Reduce RM turnover from 40% to 15%, saving $5M annually in replacement costs.',
    budget_range: '$1-1.5M',
    duration: '4 months'
})
CREATE (opp_cb_churn)-[:ADDRESSES]->(pp_turnover)
CREATE (opp_cb_churn)-[:USES_MODULE]->(mod_hr_analytics);

// **Finance Project for Health Insurance**
MATCH (pp_invoice_manual:PainPoint {name: 'Manual Invoice Processing'})
MATCH (mod_doc_intel:Module {name: 'Document Intelligence Core'})
CREATE (opp_hi_idp:ProjectOpportunity {
    title: 'Medical Invoice Automation Platform',
    priority: 'High',
    business_case: 'Process 50,000 medical invoices/month with 90% automation, reducing FTE needs by 12.',
    budget_range: '$2-2.5M',
    duration: '5 months'
})
CREATE (opp_hi_idp)-[:ADDRESSES]->(pp_invoice_manual)
CREATE (opp_hi_idp)-[:USES_MODULE]->(mod_doc_intel);

// **IT Project for Online Banking**
MATCH (pp_alert_fatigue:PainPoint {name: 'Security Alert Fatigue'})
MATCH (mod_sec_ops:Module {name: 'Security Operations Core'})
CREATE (opp_ob_soc:ProjectOpportunity {
    title: 'Intelligent Cybersecurity Threat Response',
    priority: 'High',
    business_case: 'Reduce false positive security alerts by 95% and automate incident response for 80% of routine threats.',
    budget_range: '$3-4M',
    duration: '8 months'
})
CREATE (opp_ob_soc)-[:ADDRESSES]->(pp_alert_fatigue)
CREATE (opp_ob_soc)-[:USES_MODULE]->(mod_sec_ops);

// **Operations Project for Health Insurance**
MATCH (pp_handle_time:PainPoint {name: 'Long Call Center Handle Time'})
MATCH (mod_cs:Module {name: 'Customer Service Core Modules'})
CREATE (opp_hi_call:ProjectOpportunity {
    title: 'AI-Powered Patient Service & Routing',
    priority: 'Medium',
    business_case: 'Reduce call handle time by 30% by intelligently routing patient calls to the correct department and automating basic queries.',
    budget_range: '$1-2M',
    duration: '6 months'
})
CREATE (opp_hi_call)-[:ADDRESSES]->(pp_handle_time)
CREATE (opp_hi_call)-[:USES_MODULE]->(mod_cs);

// **Risk & Compliance Project for Retail Banking**
MATCH (pp_aml_false_positives:PainPoint {name: 'AML Alert Inefficiency'})
MATCH (mod_fd:Module {name: 'Fraud Detection Core Modules'})
CREATE (opp_rb_aml:ProjectOpportunity {
    title: 'AML Transaction Monitoring Optimization',
    priority: 'High',
    business_case: 'Decrease AML false positives by 90%, freeing up compliance analysts to focus on true risks and reducing manual review time.',
    budget_range: '$2-3M',
    duration: '7 months'
})
CREATE (opp_rb_aml)-[:ADDRESSES]->(pp_aml_false_positives)
CREATE (opp_rb_aml)-[:USES_MODULE]->(mod_fd);

// --- Additional Cross-Department & Cross-Sector Opportunities ---

// **Marketing Personalization for Life Insurance**
MATCH (pp_generic_comm:PainPoint {name: 'Generic Customer Communications'})
MATCH (mod_nba:Module {name: 'Next Best Action Core'})
CREATE (opp_li_pers:ProjectOpportunity {
    title: 'Life Insurance Customer Journey Personalization',
    priority: 'Medium',
    business_case: 'Increase policy conversion rates by 25% through personalized communications and targeted content delivery.',
    budget_range: '$1.5-2M',
    duration: '5 months'
})
CREATE (opp_li_pers)-[:ADDRESSES]->(pp_generic_comm)
CREATE (opp_li_pers)-[:USES_MODULE]->(mod_nba);

// **HR Talent Acquisition for Investment Banking**
MATCH (pp_resume_volume:PainPoint {name: 'Overwhelming Resume Volume'})
MATCH (pp_turnover:PainPoint {name: 'High First-Year Turnover'})
MATCH (mod_hr_analytics:Module {name: 'HR Analytics Core'})
CREATE (opp_ib_talent:ProjectOpportunity {
    title: 'AI-Powered Investment Banking Recruitment',
    priority: 'High',
    business_case: 'Screen 10,000+ applications monthly and identify top talent with 85% accuracy, reducing time-to-hire by 50%.',
    budget_range: '$2-3M',
    duration: '6 months'
})
CREATE (opp_ib_talent)-[:ADDRESSES]->(pp_resume_volume)
CREATE (opp_ib_talent)-[:ADDRESSES]->(pp_turnover)
CREATE (opp_ib_talent)-[:USES_MODULE]->(mod_hr_analytics);

// **Finance Forecasting for Commercial Banking**
MATCH (pp_forecast_accuracy:PainPoint {name: 'Inaccurate Revenue Forecasting'})
MATCH (mod_cr:Module {name: 'Credit Scoring Core Modules'})
CREATE (opp_cb_forecast:ProjectOpportunity {
    title: 'Commercial Lending Revenue Forecasting',
    priority: 'High',
    business_case: 'Improve revenue forecast accuracy to within 5% variance using advanced ML models and external economic indicators.',
    budget_range: '$1-1.5M',
    duration: '4 months'
})
CREATE (opp_cb_forecast)-[:ADDRESSES]->(pp_forecast_accuracy)
CREATE (opp_cb_forecast)-[:USES_MODULE]->(mod_cr);

// **Operations QA Automation for Property Insurance**
MATCH (pp_qa_sampling:PainPoint {name: 'Limited QA Coverage'})
MATCH (mod_cl:Module {name: 'Claims Processing Core Modules'})
CREATE (opp_pi_qa:ProjectOpportunity {
    title: 'Automated Claims Quality Assurance',
    priority: 'Medium',
    business_case: 'Increase QA coverage from 2% to 50% of transactions through automated quality scoring and anomaly detection.',
    budget_range: '$1.5-2M',
    duration: '5 months'
})
CREATE (opp_pi_qa)-[:ADDRESSES]->(pp_qa_sampling)
CREATE (opp_pi_qa)-[:USES_MODULE]->(mod_cl);

// **IT Predictive Maintenance for Private Banking**
MATCH (pp_unplanned_downtime:PainPoint {name: 'Unplanned System Downtime'})
MATCH (mod_sec_ops:Module {name: 'Security Operations Core'})
CREATE (opp_pb_maint:ProjectOpportunity {
    title: 'Predictive System Health Monitoring',
    priority: 'High',
    business_case: 'Prevent 90% of unplanned downtime through predictive analytics on system performance metrics and preemptive maintenance.',
    budget_range: '$2-2.5M',
    duration: '6 months'
})
CREATE (opp_pb_maint)-[:ADDRESSES]->(pp_unplanned_downtime)
CREATE (opp_pb_maint)-[:USES_MODULE]->(mod_sec_ops);

// **Risk Regulatory Intelligence for Health Insurance**
MATCH (pp_reg_tracking:PainPoint {name: 'Manual Regulatory Tracking'})
MATCH (mod_cl:Module {name: 'Claims Processing Core Modules'})
CREATE (opp_hi_reg:ProjectOpportunity {
    title: 'Healthcare Regulatory Compliance Automation',
    priority: 'High',
    business_case: 'Automate tracking of 200+ yearly regulatory updates and ensure 99% compliance through intelligent document processing.',
    budget_range: '$2.5-3M',
    duration: '7 months'
})
CREATE (opp_hi_reg)-[:ADDRESSES]->(pp_reg_tracking)
CREATE (opp_hi_reg)-[:USES_MODULE]->(mod_cl);

// =================================================================
// END OF SCRIPT
// =================================================================
