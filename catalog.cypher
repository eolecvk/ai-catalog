// =================================================================
// COMPLETE SCRIPT - BANKING & INSURANCE WITH DEPARTMENTS (v2)
// This version decouples Departments from Sectors/Industries.
// =================================================================

// Clear existing graph for a clean run (Optional)
// MATCH (n) DETACH DELETE n;

// =================================================================
// SECTION 1: CREATE CORE ENTITIES (FROM ORIGINAL)
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

// --- CREATE ORIGINAL PROJECT BLUEPRINTS ---
MERGE (bp_cr:ProjectBlueprint {title: 'Credit Scoring & Risk Assessment'})
MERGE (bp_fd:ProjectBlueprint {title: 'Fraud Detection & Prevention'})
MERGE (bp_cs:ProjectBlueprint {title: 'Customer Service Platform'})
MERGE (bp_cl:ProjectBlueprint {title: 'Claims Processing & Automation'});

// --- CREATE ROLES ---
MERGE (ds:Role {name: 'Data Scientist'})
MERGE (ai:Role {name: 'AI Engineer'})
MERGE (devops:Role {name: 'DevOps Engineer'})
MERGE (mlOps:Role {name: 'MLOps Engineer'});

// --- CREATE ORIGINAL PAIN POINTS ---
MERGE (pp_loan_risk:PainPoint {name: 'Inaccurate Loan Default Prediction'})
MERGE (pp_cc_fraud:PainPoint {name: 'High-Volume Transaction Fraud'})
MERGE (pp_claim_fraud:PainPoint {name: 'Fraudulent & Inflated Claims'})
MERGE (pp_cust_churn:PainPoint {name: 'High Customer Churn Rate'})
MERGE (pp_call_volume:PainPoint {name: 'Overloaded Call Center Staff'})
MERGE (pp_slow_claims:PainPoint {name: 'Slow & Manual Claims Processing'})
MERGE (pp_health_fraud:PainPoint {name: 'Upcoding & Service Unbundling Fraud'});

// --- CREATE ORIGINAL MODULES ---
MERGE (mod_fd:Module {name: 'Fraud Detection Core Modules'})
MERGE (mod_cs:Module {name: 'Customer Service Core Modules'})
MERGE (mod_cl:Module {name: 'Claims Processing Core Modules'})
MERGE (mod_cr:Module {name: 'Credit Scoring Core Modules'});

// --- CREATE ORIGINAL SUB-MODULES ---
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
// SECTION 2: CREATE DEPARTMENT ENTITIES (NEW)
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

// --- CREATE NEW PROJECT BLUEPRINTS FOR DEPARTMENTS ---
MERGE (bp_nba:ProjectBlueprint {title: 'Next Best Action Engine'})
MERGE (bp_personalization:ProjectBlueprint {title: 'Content Personalization Platform'})
MERGE (bp_churn:ProjectBlueprint {title: 'Employee Churn Prediction'})
MERGE (bp_talent:ProjectBlueprint {title: 'AI Talent Acquisition'})
MERGE (bp_idp:ProjectBlueprint {title: 'Intelligent Document Processing'})
MERGE (bp_forecast:ProjectBlueprint {title: 'AI-Powered Forecasting'})
MERGE (bp_soc:ProjectBlueprint {title: 'Intelligent Security Operations'})
MERGE (bp_predictive_maint:ProjectBlueprint {title: 'Predictive Maintenance'})
MERGE (bp_call_routing:ProjectBlueprint {title: 'Intelligent Call Routing'})
MERGE (bp_qa_auto:ProjectBlueprint {title: 'Automated Quality Assurance'})
MERGE (bp_aml_advanced:ProjectBlueprint {title: 'Advanced AML Analytics'})
MERGE (bp_reg_intel:ProjectBlueprint {title: 'Regulatory Intelligence Platform'});

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

// --- [REMOVED] Link Sectors to Departments ---
// This section has been removed as per the new data model requirements.
// Departments are now independent of sectors.

// =================================================================
// SECTION 4: CREATE PROJECT OPPORTUNITIES
// =================================================================

// --- Original Project Opportunities ---

// **Opportunity 1: Credit Scoring for Retail Banking**
MATCH (rb:Sector {name: 'Retail Banking'})
MATCH (bp_cr:ProjectBlueprint {title: 'Credit Scoring & Risk Assessment'})
MATCH (pp_loan_risk:PainPoint {name: 'Inaccurate Loan Default Prediction'})
MATCH (ds:Role {name: 'Data Scientist'})
MATCH (mlOps:Role {name: 'MLOps Engineer'})
MATCH (sm_cr_a:SubModule {name: 'Data Foundation & Integration'})
MATCH (sm_cr_b:SubModule {name: 'Feature Engineering Module'})
MATCH (sm_cr_c:SubModule {name: 'Credit Scoring Model (Baseline)'})
MATCH (sm_cr_d:SubModule {name: 'Fairness & Bias Mitigation Layer'})
CREATE (opp_rb_cr:ProjectOpportunity {
    title: 'Next-Gen Credit Scoring for Retail Mortgages',
    priority: 'High',
    business_case: 'Improve mortgage approval accuracy and reduce defaults by using alternative data sources and mitigating model bias.'
})
CREATE (rb)-[:HAS_OPPORTUNITY]->(opp_rb_cr)
CREATE (opp_rb_cr)-[:IS_INSTANCE_OF]->(bp_cr)
CREATE (opp_rb_cr)-[:ADDRESSES]->(pp_loan_risk)
CREATE (opp_rb_cr)-[:REQUIRES_ROLE {specialty: 'Risk Modeling'}]->(ds)
CREATE (opp_rb_cr)-[:REQUIRES_ROLE]->(mlOps)
CREATE (opp_rb_cr)-[:NEEDS_SUBMODULE]->(sm_cr_a)
CREATE (opp_rb_cr)-[:NEEDS_SUBMODULE]->(sm_cr_b)
CREATE (opp_rb_cr)-[:NEEDS_SUBMODULE]->(sm_cr_c)
CREATE (opp_rb_cr)-[:NEEDS_SUBMODULE]->(sm_cr_d);

// **Opportunity 2: Fraud Detection for Retail Banking**
MATCH (rb:Sector {name: 'Retail Banking'})
MATCH (bp_fd:ProjectBlueprint {title: 'Fraud Detection & Prevention'})
MATCH (pp_cc_fraud:PainPoint {name: 'High-Volume Transaction Fraud'})
MATCH (ds:Role {name: 'Data Scientist'})
MATCH (ai:Role {name: 'AI Engineer'})
MATCH (sm_fd_a:SubModule {name: "Streaming Data Ingestion Layer"})
MATCH (sm_fd_c:SubModule {name: "Anomaly Detection Model"})
MATCH (sm_fd_d:SubModule {name: "Alert Prioritization & Explainability"})
CREATE (opp_rb_fd:ProjectOpportunity {
    title: 'Real-Time Credit Card Fraud Prevention',
    priority: 'High',
    business_case: 'Reduce financial losses from credit card fraud by 25% through real-time transaction analysis.'
})
CREATE (rb)-[:HAS_OPPORTUNITY]->(opp_rb_fd)
CREATE (opp_rb_fd)-[:IS_INSTANCE_OF]->(bp_fd)
CREATE (opp_rb_fd)-[:ADDRESSES]->(pp_cc_fraud)
CREATE (opp_rb_fd)-[:REQUIRES_ROLE]->(ds)
CREATE (opp_rb_fd)-[:REQUIRES_ROLE]->(ai)
CREATE (opp_rb_fd)-[:NEEDS_SUBMODULE]->(sm_fd_a)
CREATE (opp_rb_fd)-[:NEEDS_SUBMODULE]->(sm_fd_c)
CREATE (opp_rb_fd)-[:NEEDS_SUBMODULE]->(sm_fd_d);

// **Opportunity 3: Customer Service for Retail Banking**
MATCH (rb:Sector {name: 'Retail Banking'})
MATCH (bp_cs:ProjectBlueprint {title: 'Customer Service Platform'})
MATCH (pp_call_volume:PainPoint {name: 'Overloaded Call Center Staff'})
MATCH (ai:Role {name: 'AI Engineer'})
MATCH (devops:Role {name: 'DevOps Engineer'})
MATCH (sm_cs_a:SubModule {name: "Chatbot for FAQs"})
MATCH (sm_cs_b:SubModule {name: "Virtual Assistant for Transactions"})
MATCH (sm_cs_d:SubModule {name: "Agent Assist Tools"})
CREATE (opp_rb_cs:ProjectOpportunity {
    title: 'AI-Powered Omnichannel Customer Service Assistant',
    priority: 'Medium',
    business_case: 'Reduce call center volume by 30% and improve first-call resolution by automating common queries and empowering agents.'
})
CREATE (rb)-[:HAS_OPPORTUNITY]->(opp_rb_cs)
CREATE (opp_rb_cs)-[:IS_INSTANCE_OF]->(bp_cs)
CREATE (opp_rb_cs)-[:ADDRESSES]->(pp_call_volume)
CREATE (opp_rb_cs)-[:REQUIRES_ROLE]->(ai)
CREATE (opp_rb_cs)-[:REQUIRES_ROLE]->(devops)
CREATE (opp_rb_cs)-[:NEEDS_SUBMODULE]->(sm_cs_a)
CREATE (opp_rb_cs)-[:NEEDS_SUBMODULE]->(sm_cs_b)
CREATE (opp_rb_cs)-[:NEEDS_SUBMODULE]->(sm_cs_d);

// **Opportunity 4: Claims Processing for Property Insurance**
MATCH (pi:Sector {name: 'Property Insurance'})
MATCH (bp_cl:ProjectBlueprint {title: 'Claims Processing & Automation'})
MATCH (pp_slow_claims:PainPoint {name: 'Slow & Manual Claims Processing'})
MATCH (pp_claim_fraud:PainPoint {name: 'Fraudulent & Inflated Claims'})
MATCH (ai:Role {name: 'AI Engineer'})
MATCH (mlOps:Role {name: 'MLOps Engineer'})
MATCH (sm_cl_a:SubModule {name: 'Claims Intake Portal'})
MATCH (sm_cl_b:SubModule {name: 'OCR & Document Processing'})
MATCH (sm_cl_c:SubModule {name: 'Claims Triage & Routing'})
CREATE (opp_pi_cl:ProjectOpportunity {
    title: 'Automated Property Claims Processing',
    priority: 'High',
    business_case: 'Reduce average claims processing time by 50% and automate fraudulent claim flags using document analysis.'
})
CREATE (pi)-[:HAS_OPPORTUNITY]->(opp_pi_cl)
CREATE (opp_pi_cl)-[:IS_INSTANCE_OF]->(bp_cl)
CREATE (opp_pi_cl)-[:ADDRESSES]->(pp_slow_claims)
CREATE (opp_pi_cl)-[:ADDRESSES]->(pp_claim_fraud)
CREATE (opp_pi_cl)-[:REQUIRES_ROLE]->(ai)
CREATE (opp_pi_cl)-[:REQUIRES_ROLE]->(mlOps)
CREATE (opp_pi_cl)-[:NEEDS_SUBMODULE]->(sm_cl_a)
CREATE (opp_pi_cl)-[:NEEDS_SUBMODULE]->(sm_cl_b)
CREATE (opp_pi_cl)-[:NEEDS_SUBMODULE]->(sm_cl_c);

// --- Department-Focused Project Opportunities ---

// **Marketing Project for Retail Banking**
MATCH (rb:Sector {name: 'Retail Banking'})
MATCH (dept_mkt:Department {name: 'Marketing'})
MATCH (bp_nba:ProjectBlueprint {title: 'Next Best Action Engine'})
MATCH (pp_cross_sell:PainPoint {name: 'Ineffective Cross-Sell/Up-Sell'})
MATCH (ds:Role {name: 'Data Scientist'})
MATCH (mlOps:Role {name: 'MLOps Engineer'})
MATCH (sm_nba_a:SubModule {name: 'Customer 360 Data Layer'})
MATCH (sm_nba_b:SubModule {name: 'Propensity Modeling Engine'})
MATCH (sm_nba_c:SubModule {name: 'Recommendation Orchestrator'})
CREATE (opp_rb_nba:ProjectOpportunity {
    title: 'Next Best Action for Retail Banking Products',
    priority: 'High',
    business_case: 'Increase product penetration by 40% through AI-driven recommendations at every customer touchpoint.',
    budget_range: '$2-3M',
    duration: '6 months'
})
CREATE (dept_mkt)-[:HAS_OPPORTUNITY]->(opp_rb_nba)
CREATE (opp_rb_nba)-[:IS_INSTANCE_OF]->(bp_nba)
CREATE (opp_rb_nba)-[:ADDRESSES]->(pp_cross_sell)
CREATE (opp_rb_nba)-[:REQUIRES_ROLE]->(ds)
CREATE (opp_rb_nba)-[:REQUIRES_ROLE]->(mlOps)
CREATE (opp_rb_nba)-[:NEEDS_SUBMODULE]->(sm_nba_a)
CREATE (opp_rb_nba)-[:NEEDS_SUBMODULE]->(sm_nba_b)
CREATE (opp_rb_nba)-[:NEEDS_SUBMODULE]->(sm_nba_c)
CREATE (rb)-[:HAS_OPPORTUNITY]->(opp_rb_nba);

// **HR Project for Commercial Banking**
MATCH (cb:Sector {name: 'Commercial Banking'})
MATCH (dept_hr:Department {name: 'Human Resources'})
MATCH (bp_churn:ProjectBlueprint {title: 'Employee Churn Prediction'})
MATCH (pp_turnover:PainPoint {name: 'High First-Year Turnover'})
MATCH (ds:Role {name: 'Data Scientist'})
MATCH (sm_hr_b:SubModule {name: 'Attrition Risk Scorer'})
MATCH (sm_hr_d:SubModule {name: 'Performance Analytics'})
CREATE (opp_cb_churn:ProjectOpportunity {
    title: 'Relationship Manager Retention Analytics',
    priority: 'High',
    business_case: 'Reduce RM turnover from 40% to 15%, saving $5M annually in replacement costs.',
    budget_range: '$1-1.5M',
    duration: '4 months'
})
CREATE (dept_hr)-[:HAS_OPPORTUNITY]->(opp_cb_churn)
CREATE (opp_cb_churn)-[:IS_INSTANCE_OF]->(bp_churn)
CREATE (opp_cb_churn)-[:ADDRESSES]->(pp_turnover)
CREATE (opp_cb_churn)-[:REQUIRES_ROLE]->(ds)
CREATE (opp_cb_churn)-[:NEEDS_SUBMODULE]->(sm_hr_b)
CREATE (opp_cb_churn)-[:NEEDS_SUBMODULE]->(sm_hr_d)
CREATE (cb)-[:HAS_OPPORTUNITY]->(opp_cb_churn);

// **Finance Project for Health Insurance**
MATCH (hi:Sector {name: 'Health Insurance'})
MATCH (dept_fin:Department {name: 'Finance'})
MATCH (bp_idp:ProjectBlueprint {title: 'Intelligent Document Processing'})
MATCH (pp_invoice_manual:PainPoint {name: 'Manual Invoice Processing'})
MATCH (ai:Role {name: 'AI Engineer'})
MATCH (sm_cl_b:SubModule {name: 'OCR & Document Processing'})
CREATE (opp_hi_idp:ProjectOpportunity {
    title: 'Medical Invoice Automation Platform',
    priority: 'High',
    business_case: 'Process 50,000 medical invoices/month with 90% automation, reducing FTE needs by 12.',
    budget_range: '$2-2.5M',
    duration: '5 months'
})
CREATE (dept_fin)-[:HAS_OPPORTUNITY]->(opp_hi_idp)
CREATE (opp_hi_idp)-[:IS_INSTANCE_OF]->(bp_idp)
CREATE (opp_hi_idp)-[:ADDRESSES]->(pp_invoice_manual)
CREATE (opp_hi_idp)-[:REQUIRES_ROLE]->(ai)
CREATE (opp_hi_idp)-[:NEEDS_SUBMODULE]->(sm_cl_b)
CREATE (hi)-[:HAS_OPPORTUNITY]->(opp_hi_idp);

// **IT Project for Online Banking**
MATCH (ob:Sector {name: 'Online Banking'})
MATCH (dept_it:Department {name: 'IT'})
MATCH (bp_soc:ProjectBlueprint {title: 'Intelligent Security Operations'})
MATCH (pp_alert_fatigue:PainPoint {name: 'Security Alert Fatigue'})
MATCH (ai:Role {name: 'AI Engineer'})
MATCH (devops:Role {name: 'DevOps Engineer'})
MATCH (sm_secops_a:SubModule {name: 'Threat Intelligence Dashboard'})
MATCH (sm_secops_b:SubModule {name: 'Automated Incident Response'})
CREATE (opp_ob_soc:ProjectOpportunity {
    title: 'Intelligent Cybersecurity Threat Response',
    priority: 'High',
    business_case: 'Reduce false positive security alerts by 95% and automate incident response for 80% of routine threats.',
    budget_range: '$3-4M',
    duration: '8 months'
})
CREATE (dept_it)-[:HAS_OPPORTUNITY]->(opp_ob_soc)
CREATE (opp_ob_soc)-[:IS_INSTANCE_OF]->(bp_soc)
CREATE (opp_ob_soc)-[:ADDRESSES]->(pp_alert_fatigue)
CREATE (opp_ob_soc)-[:REQUIRES_ROLE]->(ai)
CREATE (opp_ob_soc)-[:REQUIRES_ROLE]->(devops)
CREATE (opp_ob_soc)-[:NEEDS_SUBMODULE]->(sm_secops_a)
CREATE (opp_ob_soc)-[:NEEDS_SUBMODULE]->(sm_secops_b)
CREATE (ob)-[:HAS_OPPORTUNITY]->(opp_ob_soc);

// **Operations Project for Health Insurance**
MATCH (hi:Sector {name: 'Health Insurance'})
MATCH (dept_ops:Department {name: 'Operations'})
MATCH (bp_call_routing:ProjectBlueprint {title: 'Intelligent Call Routing'})
MATCH (pp_handle_time:PainPoint {name: 'Long Call Center Handle Time'})
MATCH (ai:Role {name: 'AI Engineer'})
MATCH (ds:Role {name: 'Data Scientist'})
MATCH (sm_cs_a:SubModule {name: "Chatbot for FAQs"})
MATCH (sm_cs_c:SubModule {name: "Sentiment Analysis & Escalation"})
CREATE (opp_hi_call:ProjectOpportunity {
    title: 'AI-Powered Patient Service & Routing',
    priority: 'Medium',
    business_case: 'Reduce call handle time by 30% by intelligently routing patient calls to the correct department and automating basic queries.',
    budget_range: '$1-2M',
    duration: '6 months'
})
CREATE (dept_ops)-[:HAS_OPPORTUNITY]->(opp_hi_call)
CREATE (opp_hi_call)-[:IS_INSTANCE_OF]->(bp_call_routing)
CREATE (opp_hi_call)-[:ADDRESSES]->(pp_handle_time)
CREATE (opp_hi_call)-[:REQUIRES_ROLE]->(ai)
CREATE (opp_hi_call)-[:REQUIRES_ROLE]->(ds)
CREATE (opp_hi_call)-[:NEEDS_SUBMODULE]->(sm_cs_a)
CREATE (opp_hi_call)-[:NEEDS_SUBMODULE]->(sm_cs_c)
CREATE (hi)-[:HAS_OPPORTUNITY]->(opp_hi_call);

// **Risk & Compliance Project for Retail Banking**
MATCH (rb:Sector {name: 'Retail Banking'})
MATCH (dept_risk:Department {name: 'Risk & Compliance'})
MATCH (bp_aml_advanced:ProjectBlueprint {title: 'Advanced AML Analytics'})
MATCH (pp_aml_false_positives:PainPoint {name: 'AML Alert Inefficiency'})
MATCH (ds:Role {name: 'Data Scientist'})
MATCH (mlOps:Role {name: 'MLOps Engineer'})
MATCH (sm_fd_a:SubModule {name: "Streaming Data Ingestion Layer"})
MATCH (sm_fd_c:SubModule {name: "Anomaly Detection Model"})
CREATE (opp_rb_aml:ProjectOpportunity {
    title: 'AML Transaction Monitoring Optimization',
    priority: 'High',
    business_case: 'Decrease AML false positives by 90%, freeing up compliance analysts to focus on true risks and reducing manual review time.',
    budget_range: '$2-3M',
    duration: '7 months'
})
CREATE (dept_risk)-[:HAS_OPPORTUNITY]->(opp_rb_aml)
CREATE (opp_rb_aml)-[:IS_INSTANCE_OF]->(bp_aml_advanced)
CREATE (opp_rb_aml)-[:ADDRESSES]->(pp_aml_false_positives)
CREATE (opp_rb_aml)-[:REQUIRES_ROLE]->(ds)
CREATE (opp_rb_aml)-[:REQUIRES_ROLE]->(mlOps)
CREATE (opp_rb_aml)-[:NEEDS_SUBMODULE]->(sm_fd_a)
CREATE (opp_rb_aml)-[:NEEDS_SUBMODULE]->(sm_fd_c)
CREATE (rb)-[:HAS_OPPORTUNITY]->(opp_rb_aml);
