/**
 * PRUDEV II — MSME Financial Improvement Action Plan (FIAP) Standard Constants.
 * Grounded in the official PRUDEV II Access to Finance & Credit Readiness Roadmap Template.
 * (docs/templates/msme_financial_improvement_action_plan_template.md)
 */

export const FIAP_CATEGORIES = [
  {
    id: '1_financial_records',
    number: 1,
    name: 'Financial Records & Documentation Strengthening',
    what_it_addresses:
      'No or weak financial records; lenders and credit analysts cannot appraise the business without 6–12 months of clean, verifiable statements.',
    key_indicators:
      'No cashbook; no receipts or invoices; no sales/purchases ledger; financial records mixed with personal memory.',
    default_priority: 'High',
    typical_gaps: [
      'No financial records kept',
      'Record keeping and documentation still need strengthening',
      'Poor / unclear cash-flow management & cash mixing',
      'Weak or no bankable business plan',
      'No acceptable collateral available',
      'No bank relationship (mobile money or informal only)',
      'Low financial literacy',
      'Weak costing, budgeting, operational-cost management and internal controls',
    ],
    default_steps: [
      {
        step: 1,
        action:
          'Set up a cashbook, sales/purchases register, and receipt/invoice book; record every transaction daily and prepare a monthly income statement.',
        timeline: 'Months 1–3',
        responsible: 'Owner / Cashier',
        verification: 'Verified daily cashbook entries & filed monthly P&L summaries',
      },
      {
        step: 2,
        action:
          'Prepare a 12-month cash-flow projection and compare actual vs projected monthly; pay the owner a fixed salary to separate personal and business money; follow up late-paying customers weekly; build a cash reserve buffer of at least one month of operating costs.',
        timeline: 'Months 1–3',
        responsible: 'Owner & BGE',
        verification: '12-month cash-flow spreadsheet & separate salary voucher',
      },
      {
        step: 3,
        action:
          'Develop or revise a bankable business plan (market analysis, operations, 3-year financial projections, and a specific funding request stating amount, purpose, and repayment source); have the BGE mentor review it prior to submission.',
        timeline: 'Months 2–4',
        responsible: 'BGE & Owner',
        verification: 'Reviewed bankable business plan document',
      },
      {
        step: 4,
        action:
          'List and document all enterprise assets (land purchase agreement/title, machinery, processing equipment, stock, receivables) and negotiate alternative security with lenders: movable-asset (chattel) registration, group/personal guarantees, warehouse receipts, or agricultural credit guarantee schemes.',
        timeline: 'Months 1–3',
        responsible: 'Owner & BGE',
        verification: 'Asset schedule with supporting agreements/titles',
      },
      {
        step: 5,
        action:
          'Open or activate a dedicated business account with the preferred Financial Service Provider (FSP) and route 100% of business revenues through it for at least 6 months to establish an appraisal-ready bank statement history.',
        timeline: 'Months 1–6',
        responsible: 'Owner',
        verification: 'Bank account confirmation letter & 6-month bank statement',
      },
      {
        step: 6,
        action:
          'Attend structured financial-literacy coaching on budgeting, loan amortization, interest calculations, debt service coverage ratio (DSCR), and repayment discipline.',
        timeline: 'Months 1–3',
        responsible: 'Owner & Key Staff',
        verification: 'Training attendance record & monthly review minutes',
      },
      {
        step: 7,
        action:
          'Visit the preferred FSP, obtain its specific credit product checklist and named loan-officer contact; assemble the complete loan documentation pack (application form, financial statements, business plan, KYC documents, collateral inventory) with bi-weekly BGE review.',
        timeline: 'Months 2–4',
        responsible: 'BGE & Owner',
        verification: 'Completed lender application dossier checklist',
      },
      {
        step: 8,
        action:
          'Re-assess finance readiness with the BGE mentor at Month 4 (or Month 6) using the diagnostic readiness matrix, verify all lender prerequisites, and formally submit the loan application pack to the target FSP.',
        timeline: 'Month 4 / Month 6',
        responsible: 'BGE Mentor & Owner',
        verification: 'Signed Credit Readiness Scorecard & bank submission acknowledgement',
      },
    ],
  },
  {
    id: '2_cash_flow',
    number: 2,
    name: 'Cash-Flow Management & Financial Discipline',
    what_it_addresses:
      'Records exist but cash flow is poorly managed, personal and enterprise money are mixed, or cash reserves are absent; repayment capacity cannot be established.',
    key_indicators:
      'Frequent cash shortages despite profitable sales; owner withdrawing cash directly from till; no 12-month cash forecast; zero emergency buffer.',
    default_priority: 'Medium',
    typical_gaps: [
      'Poor / unclear cash-flow management & cash mixing',
      'Financial forecasting / planning is weak',
      'Weak or no bankable business plan',
      'Low financial literacy',
      'Weak costing, budgeting, operational-cost management and internal controls',
      'Active loan — repayment performance must be protected',
    ],
    default_steps: [
      {
        step: 1,
        action:
          'Prepare a 12-month cash-flow projection and compare actual vs projected monthly; pay the owner a fixed salary to separate personal and business money; follow up late-paying customers weekly; build a cash reserve buffer of at least one month of operating costs.',
        timeline: 'Months 1–3',
        responsible: 'Owner & BGE',
        verification: 'Cash-flow projection sheet & monthly variance report',
      },
      {
        step: 2,
        action:
          'Calculate unit cost of production, review pricing structures, compute break-even sales volume, and set a monthly budget; track actual vs budget and conduct monthly internal financial review meetings.',
        timeline: 'Months 1–3',
        responsible: 'Owner & Accounts',
        verification: 'Costing model sheet & monthly budget review notes',
      },
      {
        step: 3,
        action:
          'Develop or revise a bankable business plan (market analysis, operations, 3-year financial projections, and a specific funding request stating amount, purpose, and repayment source); have the BGE mentor review it prior to submission.',
        timeline: 'Months 2–4',
        responsible: 'BGE & Owner',
        verification: 'Business plan reviewed by BGE mentor',
      },
      {
        step: 4,
        action:
          'Attend structured financial-literacy coaching on budgeting, loan amortization, interest calculations, debt service coverage ratio (DSCR), and repayment discipline.',
        timeline: 'Months 1–3',
        responsible: 'Owner',
        verification: 'Training completion record & expense control policy',
      },
      {
        step: 5,
        action:
          'Protect repayment performance: schedule monthly instalments from operating cash flow, eliminate arrears, request a Credit Reference Bureau (CRB) financial report, and use clean credit history to negotiate larger or cheaper facilities.',
        timeline: 'Ongoing / Months 3–6',
        responsible: 'Owner',
        verification: 'Bank loan statement showing zero arrears / CRB report',
      },
      {
        step: 6,
        action:
          'Re-assess finance readiness with the BGE mentor at Month 4 (or Month 6) using the diagnostic readiness matrix, verify all lender prerequisites, and formally submit the loan application pack to the target FSP.',
        timeline: 'Month 4 / Month 6',
        responsible: 'BGE & Owner',
        verification: 'Formal loan submission receipt from FSP',
      },
    ],
  },
  {
    id: '3_business_plan',
    number: 3,
    name: 'Business Plan & Financial Projection Development',
    what_it_addresses:
      'Business plan is weak or missing; no bankable document, 3-year cash forecast, or clear funding request detailing use of funds and debt-service source.',
    key_indicators:
      'Business operating on day-to-day survival; unable to present written expansion plan to bank loan officer; missing financial projections.',
    default_priority: 'Low',
    typical_gaps: [
      'Weak or no bankable business plan',
      'Financial forecasting / planning is weak',
      'Record keeping and documentation still need strengthening',
      'No acceptable collateral available',
      'Weak costing, budgeting, operational-cost management and internal controls',
      'Limited linkage to financial institutions and wider markets',
    ],
    default_steps: [
      {
        step: 1,
        action:
          'Develop or revise a bankable business plan (market analysis, operations, 3-year financial projections, and a specific funding request stating amount, purpose, and repayment source); have the BGE mentor review it prior to submission.',
        timeline: 'Months 2–4',
        responsible: 'BGE & Owner',
        verification: 'Final validated business plan document with 3-year model',
      },
      {
        step: 2,
        action:
          'List and document all enterprise assets (land purchase agreement/title, machinery, processing equipment, stock, receivables) and negotiate alternative security with lenders: movable-asset (chattel) registration, group/personal guarantees, warehouse receipts, or agricultural credit guarantee schemes.',
        timeline: 'Months 1–3',
        responsible: 'Owner & BGE',
        verification: 'Asset schedule with supporting agreements/titles',
      },
      {
        step: 3,
        action:
          'Open or activate a dedicated business account with the preferred Financial Service Provider (FSP) and route 100% of business revenues through it for at least 6 months to establish an appraisal-ready bank statement history.',
        timeline: 'Months 1–6',
        responsible: 'Owner',
        verification: 'Bank statement history from preferred lender',
      },
      {
        step: 4,
        action:
          'Visit the preferred FSP, obtain its specific credit product checklist and named loan-officer contact; assemble the complete loan documentation pack (application form, financial statements, business plan, KYC documents, collateral inventory) with bi-weekly BGE review.',
        timeline: 'Month 1 / Months 2–4',
        responsible: 'BGE & Owner',
        verification: 'FSP checklist & named loan officer engagement report',
      },
      {
        step: 5,
        action:
          'Re-assess finance readiness with the BGE mentor at Month 4 (or Month 6) using the diagnostic readiness matrix, verify all lender prerequisites, and formally submit the loan application pack to the target FSP.',
        timeline: 'Month 4 / Month 6',
        responsible: 'BGE & Owner',
        verification: 'Submitted application pack confirmation receipt',
      },
    ],
  },
  {
    id: '4_collateral',
    number: 4,
    name: 'Collateral & Alternative Security Solutions',
    what_it_addresses:
      'Otherwise viable and creditworthy enterprise but lacks traditional physical land title or urban real estate; requires movable-asset security or guarantee structures.',
    key_indicators:
      'Borrower lacks registered land title; owns machinery, stock, or crops; needs chattel mortgage, warehouse receipt, or credit guarantee linkage.',
    default_priority: 'Medium',
    typical_gaps: [
      'No acceptable collateral available',
      'No bank relationship (mobile money or informal only)',
      'Record keeping and documentation still need strengthening',
      'Limited linkage to financial institutions and wider markets',
      'Weak or no bankable business plan',
    ],
    default_steps: [
      {
        step: 1,
        action:
          'List and document all enterprise assets (land purchase agreement/title, machinery, processing equipment, stock, receivables) and negotiate alternative security with lenders: movable-asset (chattel) registration, group/personal guarantees, warehouse receipts, or agricultural credit guarantee schemes.',
        timeline: 'Months 1–3',
        responsible: 'Owner & BGE',
        verification: 'Verified asset register & chattel pledge schedule',
      },
      {
        step: 2,
        action:
          'Open or activate a dedicated business account with the preferred Financial Service Provider (FSP) and route 100% of business revenues through it for at least 6 months to establish an appraisal-ready bank statement history.',
        timeline: 'Months 1–6',
        responsible: 'Owner',
        verification: '6-month active bank statement from preferred lender',
      },
      {
        step: 3,
        action:
          'Organise linkage meetings with FSPs and buyers, share the product catalogue, and join trade fairs/exhibitions to widen markets and demonstrate customer demand to lenders.',
        timeline: 'Months 2–6',
        responsible: 'BGE & Owner',
        verification: 'Supply contracts / purchase orders from buyers as repayment collateral',
      },
      {
        step: 4,
        action:
          'Calculate unit cost of production, review pricing structures, compute break-even sales volume, and set a monthly budget; track actual vs budget and conduct monthly internal financial review meetings.',
        timeline: 'Months 1–3',
        responsible: 'Owner & BGE',
        verification: 'Costing spreadsheet and budget control log',
      },
      {
        step: 5,
        action:
          'Visit the preferred FSP, obtain its specific credit product checklist and named loan-officer contact; assemble the complete loan documentation pack (application form, financial statements, business plan, KYC documents, collateral inventory) with bi-weekly BGE review.',
        timeline: 'Months 2–4',
        responsible: 'BGE & Owner',
        verification: 'Complete loan documentation pack ready for bank appraisal',
      },
      {
        step: 6,
        action:
          'Re-assess finance readiness with the BGE mentor at Month 4 (or Month 6) using the diagnostic readiness matrix, verify all lender prerequisites, and formally submit the loan application pack to the target FSP.',
        timeline: 'Month 4 / Month 6',
        responsible: 'BGE Mentor',
        verification: 'Bank appraisal and loan submission receipt',
      },
    ],
  },
  {
    id: '5_banking_relationship',
    number: 5,
    name: 'Banking Relationship & Financial-Institution Linkage',
    what_it_addresses:
      'No formal commercial bank relationship (relies exclusively on mobile money or informal village savings/SACCOs) or limited linkage to credit providers.',
    key_indicators:
      'Enterprise revenue not routed through bank; transactions unrecorded by credit bureau; no relationship officer assigned; unbanked cash transactions.',
    default_priority: 'Low',
    typical_gaps: [
      'No bank relationship (mobile money or informal only)',
      'Limited linkage to financial institutions and wider markets',
      'Record keeping and documentation still need strengthening',
      'Low financial literacy',
    ],
    default_steps: [
      {
        step: 1,
        action:
          'Open or activate a dedicated business account with the preferred Financial Service Provider (FSP) and route 100% of business revenues through it for at least 6 months to establish an appraisal-ready bank statement history.',
        timeline: 'Months 1–6',
        responsible: 'Owner',
        verification: 'Bank account activation certificate & statement',
      },
      {
        step: 2,
        action:
          'Organise linkage meetings with FSPs and buyers, share the product catalogue, and join trade fairs/exhibitions to widen markets and demonstrate customer demand to lenders.',
        timeline: 'Months 2–6',
        responsible: 'BGE & Owner',
        verification: 'FSP credit officer engagement log',
      },
      {
        step: 3,
        action:
          'Visit the preferred FSP, obtain its specific credit product checklist and named loan-officer contact; assemble the complete loan documentation pack (application form, financial statements, business plan, KYC documents, collateral inventory) with bi-weekly BGE review.',
        timeline: 'Month 1',
        responsible: 'Owner & BGE',
        verification: 'FSP requirements checklist & officer business card',
      },
      {
        step: 4,
        action:
          'Re-assess finance readiness with the BGE mentor at Month 4 (or Month 6) using the diagnostic readiness matrix, verify all lender prerequisites, and formally submit the loan application pack to the target FSP.',
        timeline: 'Months 1–3',
        responsible: 'Owner & BGE',
        verification: 'Stamped loan submission receipt',
      },
    ],
  },
  {
    id: '6_financial_literacy',
    number: 6,
    name: 'Financial Literacy, Costing & Management Capacity Building',
    what_it_addresses:
      'Weak unit costing, pricing, break-even calculation, budgeting, internal controls, or financial literacy that undermines credit readiness.',
    key_indicators:
      'Selling below actual unit production cost; ignorance of loan interest rates and amortization schedules; weak staff expense controls.',
    default_priority: 'Low',
    typical_gaps: [
      'Low financial literacy',
      'Weak costing, budgeting, operational-cost management and internal controls',
      'Record keeping and documentation still need strengthening',
      'Financial forecasting / planning is weak',
      'Limited linkage to financial institutions and wider markets',
    ],
    default_steps: [
      {
        step: 1,
        action:
          'Calculate unit cost of production, review pricing structures, compute break-even sales volume, and set a monthly budget; track actual vs budget and conduct monthly internal financial review meetings.',
        timeline: 'Months 1–3',
        responsible: 'Owner & BGE',
        verification: 'Production unit costing model & pricing schedule',
      },
      {
        step: 2,
        action:
          'Attend structured financial-literacy coaching on budgeting, loan amortization, interest calculations, debt service coverage ratio (DSCR), and repayment discipline.',
        timeline: 'Months 1–3',
        responsible: 'Owner & Team',
        verification: 'Training attendance certificate / log',
      },
      {
        step: 3,
        action:
          'Visit the preferred FSP, obtain its specific credit product checklist and named loan-officer contact; assemble the complete loan documentation pack (application form, financial statements, business plan, KYC documents, collateral inventory) with bi-weekly BGE review.',
        timeline: 'Months 2–4',
        responsible: 'BGE & Owner',
        verification: 'Assembled loan application pack',
      },
      {
        step: 4,
        action:
          'Re-assess finance readiness with the BGE mentor at Month 4 (or Month 6) using the diagnostic readiness matrix, verify all lender prerequisites, and formally submit the loan application pack to the target FSP.',
        timeline: 'Months 1–3',
        responsible: 'Owner',
        verification: 'Bank loan application receipt',
      },
    ],
  },
  {
    id: '7_loan_readiness',
    number: 7,
    name: 'Loan Application & Investment Readiness (Finance-Ready)',
    what_it_addresses:
      'Enterprise is largely creditworthy and compliant; the immediate bottleneck is assembling the application pack, product matching, and formal submission.',
    key_indicators:
      '6–12 months of clean statements exist; registered; viable model; needs guidance on FSP product selection and submission packaging.',
    default_priority: 'Low',
    typical_gaps: [
      'Limited linkage to financial institutions and wider markets',
      'Financial forecasting / planning is weak',
    ],
    default_steps: [
      {
        step: 1,
        action:
          'Visit the preferred FSP, obtain its specific credit product checklist and named loan-officer contact; assemble the complete loan documentation pack (application form, financial statements, business plan, KYC documents, collateral inventory) with bi-weekly BGE review.',
        timeline: 'Month 1',
        responsible: 'Owner & BGE',
        verification: 'Complete, verified loan application binder',
      },
      {
        step: 2,
        action:
          'Calculate unit cost of production, review pricing structures, compute break-even sales volume, and set a monthly budget; track actual vs budget and conduct monthly internal financial review meetings.',
        timeline: 'Month 1',
        responsible: 'BGE & Owner',
        verification: 'Debt Service Coverage Ratio (DSCR) worksheet',
      },
      {
        step: 3,
        action:
          'Re-assess finance readiness with the BGE mentor at Month 4 (or Month 6) using the diagnostic readiness matrix, verify all lender prerequisites, and formally submit the loan application pack to the target FSP.',
        timeline: 'Months 1–3',
        responsible: 'Owner & BGE',
        verification: 'Official bank submission acknowledgement',
      },
    ],
  },
  {
    id: '8_debt_management',
    number: 8,
    name: 'Debt Management & Credit Growth',
    what_it_addresses:
      'Enterprise has an active loan or past borrowing history; priority is protecting repayment performance, avoiding arrears, and graduating to larger/cheaper bank finance.',
    key_indicators:
      'Servicing running loan; risk of default or delayed instalments; borrowing from costly informal money-lenders; ready to refinance into commercial bank.',
    default_priority: 'Low',
    typical_gaps: [
      'Active loan — repayment performance must be protected',
      'Poor / unclear cash-flow management & cash mixing',
      'Financial forecasting / planning is weak',
    ],
    default_steps: [
      {
        step: 1,
        action:
          'Protect repayment performance: schedule monthly instalments from operating cash flow, eliminate arrears, request a Credit Reference Bureau (CRB) financial report, and use clean credit history to negotiate larger or cheaper facilities.',
        timeline: 'Ongoing / Months 3–6',
        responsible: 'Owner',
        verification: 'CRB clearance / clean loan statement history',
      },
      {
        step: 2,
        action:
          'Visit the preferred FSP, obtain its specific credit product checklist and named loan-officer contact; assemble the complete loan documentation pack (application form, financial statements, business plan, KYC documents, collateral inventory) with bi-weekly BGE review.',
        timeline: 'Months 2–4',
        responsible: 'BGE & Owner',
        verification: 'Top-up / refinancing application dossier',
      },
      {
        step: 3,
        action:
          'Re-assess finance readiness with the BGE mentor at Month 4 (or Month 6) using the diagnostic readiness matrix, verify all lender prerequisites, and formally submit the loan application pack to the target FSP.',
        timeline: 'Months 1–3',
        responsible: 'Owner',
        verification: 'Bank acknowledgement of top-up / refinancing facility',
      },
    ],
  },
  {
    id: '9_formalisation',
    number: 9,
    name: 'Formalisation, Audit & Certification',
    what_it_addresses:
      'Legal registration (URSB), tax compliance (URA TIN), trading license, independent audit, or product certification (e.g. UNBS) is the gating barrier to formal credit.',
    key_indicators:
      'Operating informally; unregistered company; lacks URA TIN or trading license; product uncertified by UNBS preventing formal supermarket/export sales.',
    default_priority: 'High',
    typical_gaps: [
      'Business is not formally registered',
      'Product certification (UNBS) pending',
      'Books of account not yet audited / reviewed',
      'No financial records kept',
      'Poor / unclear cash-flow management & cash mixing',
      'Weak or no bankable business plan',
      'No acceptable collateral available',
      'No bank relationship (mobile money or informal only)',
      'Low financial literacy',
    ],
    default_steps: [
      {
        step: 1,
        action:
          'Register the business with URSB, obtain a Tax Identification Number (URA TIN), and secure a municipal trading licence; keep certificates filed for lender KYC checks.',
        timeline: 'Months 1–2',
        responsible: 'Owner',
        verification: 'URSB certificate, URA TIN certificate, Trading licence',
      },
      {
        step: 2,
        action:
          'Set up a cashbook, sales/purchases register, and receipt/invoice book; record every transaction daily and prepare a monthly income statement.',
        timeline: 'Months 1–3',
        responsible: 'Owner / Cashier',
        verification: 'Cashbook and monthly financial summaries',
      },
      {
        step: 3,
        action:
          'Prepare a 12-month cash-flow projection and compare actual vs projected monthly; pay the owner a fixed salary to separate personal and business money; follow up late-paying customers weekly; build a cash reserve buffer of at least one month of operating costs.',
        timeline: 'Months 1–3',
        responsible: 'Owner & BGE',
        verification: '12-month cash-flow projection and salary policy',
      },
      {
        step: 4,
        action:
          'Develop or revise a bankable business plan (market analysis, operations, 3-year financial projections, and a specific funding request stating amount, purpose, and repayment source); have the BGE mentor review it prior to submission.',
        timeline: 'Months 2–4',
        responsible: 'BGE & Owner',
        verification: 'Reviewed business plan draft',
      },
      {
        step: 5,
        action:
          'List and document all enterprise assets (land purchase agreement/title, machinery, processing equipment, stock, receivables) and negotiate alternative security with lenders: movable-asset (chattel) registration, group/personal guarantees, warehouse receipts, or agricultural credit guarantee schemes.',
        timeline: 'Months 1–3',
        responsible: 'Owner & BGE',
        verification: 'Asset schedule with supporting agreements',
      },
      {
        step: 6,
        action:
          'Open or activate a dedicated business account with the preferred Financial Service Provider (FSP) and route 100% of business revenues through it for at least 6 months to establish an appraisal-ready bank statement history.',
        timeline: 'Months 1–6',
        responsible: 'Owner',
        verification: 'Bank account statement history',
      },
      {
        step: 7,
        action:
          'Visit the preferred FSP, obtain its specific credit product checklist and named loan-officer contact; assemble the complete loan documentation pack (application form, financial statements, business plan, KYC documents, collateral inventory) with bi-weekly BGE review.',
        timeline: 'Months 2–4',
        responsible: 'BGE & Owner',
        verification: 'Completed loan pack on file',
      },
      {
        step: 8,
        action:
          'Re-assess finance readiness with the BGE mentor at Month 4 (or Month 6) using the diagnostic readiness matrix, verify all lender prerequisites, and formally submit the loan application pack to the target FSP.',
        timeline: 'Month 4 / Month 6',
        responsible: 'BGE Mentor',
        verification: 'Credit readiness scorecard at Month 6',
      },
    ],
  },
];

export const STANDARD_GAPS = [
  'No financial records kept',
  'Record keeping and documentation still need strengthening',
  'Poor / unclear cash-flow management & cash mixing',
  'Weak or no bankable business plan',
  'Financial forecasting / planning is weak',
  'No acceptable collateral available',
  'No bank relationship (mobile money or informal only)',
  'Limited linkage to financial institutions and wider markets',
  'Low financial literacy',
  'Weak costing, budgeting, operational-cost management and internal controls',
  'Business is not formally registered',
  'Product certification (UNBS) pending',
  'Books of account not yet audited / reviewed',
  'Active loan — repayment performance must be protected',
];

export const STANDARD_FSPS = [
  'Centenary Bank',
  'PostBank Uganda',
  'Stanbic Bank',
  'DFCU Bank',
  'Equity Bank',
  'Housing Finance Bank',
  'ABSA Bank Uganda',
  'Bank of Africa',
  'KCB Bank Uganda',
  'Local Licensed SACCO',
  'Parish Development Model (PDM)',
];

export const STANDARD_FACILITIES = [
  'Working Capital Loan',
  'Equipment & Machinery Finance',
  'First-time Working-Capital Loan (Bank/SACCO)',
  'Top-up / Expansion Facility',
  'First Small Loan: SACCO / PDM',
  'Agricultural Value-Chain / Trade Finance',
  'Matching Grant / Blended Finance',
];

export const STANDARD_ROADMAP_STEPS = [
  {
    step: 1,
    title: 'Financial Records Setup',
    action:
      'Set up a cashbook, sales/purchases register, and receipt/invoice book; record every transaction daily and prepare a monthly income statement.',
    timeline: 'Months 1–3',
    responsible: 'Owner / Cashier',
    verification: 'Inspected cashbook entries',
  },
  {
    step: 2,
    title: 'Cash-Flow Projection & Financial Discipline',
    action:
      'Prepare a 12-month cash-flow projection and compare actual vs projected monthly; pay the owner a fixed salary to separate personal and business money; follow up late-paying customers weekly; build a cash reserve buffer of at least one month of operating costs.',
    timeline: 'Months 1–3',
    responsible: 'Owner & BGE',
    verification: 'Cash-flow forecast sheet',
  },
  {
    step: 3,
    title: 'Formal Business Registration & Compliance',
    action:
      'Register the business with URSB, obtain a Tax Identification Number (URA TIN), and secure a municipal trading licence; keep certificates filed for lender KYC checks.',
    timeline: 'Months 1–2',
    responsible: 'Owner',
    verification: 'URSB certificate & TIN slip',
  },
  {
    step: 4,
    title: 'Bankable Business Plan Formulation',
    action:
      'Develop or revise a bankable business plan (market analysis, operations, 3-year financial projections, and a specific funding request stating amount, purpose, and repayment source); have the BGE mentor review it prior to submission.',
    timeline: 'Months 2–4',
    responsible: 'BGE & Owner',
    verification: 'Reviewed business plan draft',
  },
  {
    step: 5,
    title: 'Asset Valuation & Alternative Security Structuring',
    action:
      'List and document all enterprise assets (land purchase agreement/title, machinery, processing equipment, stock, receivables) and negotiate alternative security with lenders: movable-asset (chattel) registration, group/personal guarantees, warehouse receipts, or agricultural credit guarantee schemes.',
    timeline: 'Months 1–3',
    responsible: 'Owner & BGE',
    verification: 'Asset schedule with supporting agreements',
  },
  {
    step: 6,
    title: 'Commercial Bank Account Activation & Statement History',
    action:
      'Open or activate a dedicated business account with the preferred Financial Service Provider (FSP) and route 100% of business revenues through it for at least 6 months to establish an appraisal-ready bank statement history.',
    timeline: 'Months 1–6',
    responsible: 'Owner',
    verification: 'Bank passbook / 6-mo statement',
  },
  {
    step: 7,
    title: 'Unit Costing, Break-Even & Internal Controls',
    action:
      'Calculate unit cost of production, review pricing structures, compute break-even sales volume, and set a monthly budget; track actual vs budget and conduct monthly internal financial review meetings.',
    timeline: 'Months 1–3',
    responsible: 'Production Lead / Owner',
    verification: 'Costing sheet & budget log',
  },
  {
    step: 8,
    title: 'Financial Literacy & Loan Terms Coaching',
    action:
      'Attend structured financial-literacy coaching on budgeting, loan amortization, interest calculations, debt service coverage ratio (DSCR), and repayment discipline.',
    timeline: 'Months 1–3',
    responsible: 'Owner & Team',
    verification: 'Training certificate & attendance log',
  },
  {
    step: 9,
    title: 'FSP Engagement & Loan Dossier Assembly',
    action:
      'Visit the preferred FSP, obtain its specific credit product checklist and named loan-officer contact; assemble the complete loan documentation pack (application form, financial statements, business plan, KYC documents, collateral inventory) with bi-weekly BGE review.',
    timeline: 'Month 1 / Months 2–4',
    responsible: 'BGE & Owner',
    verification: 'Submitted FSP application pack checklist',
  },
  {
    step: 10,
    title: 'Repayment Protection & Credit Graduation',
    action:
      'Protect repayment performance: schedule monthly instalments from operating cash flow, eliminate arrears, request a Credit Reference Bureau (CRB) financial report, and use clean credit history to negotiate larger or cheaper facilities.',
    timeline: 'Ongoing / Months 3–6',
    responsible: 'Owner',
    verification: 'CRB clearance report / bank statement showing zero arrears',
  },
  {
    step: 11,
    title: 'Finance Readiness Re-Assessment & Formal Loan Submission',
    action:
      'Re-assess finance readiness with the BGE mentor at Month 4 (or Month 6) using the diagnostic readiness matrix, verify all lender prerequisites, and formally submit the loan application pack to the target FSP.',
    timeline: 'Month 4 / Month 6',
    responsible: 'BGE & Owner',
    verification: 'FSP acknowledgment slip',
  },
];
