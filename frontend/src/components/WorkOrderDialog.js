import React from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, FormControlLabel, Grid,
  IconButton, InputLabel, MenuItem, Select, TextField, Typography,
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import axios from 'axios';
import { API_ENDPOINTS } from '../config';

// ── Work Order Dialog (memoised to prevent full-Dashboard re-renders on keystrokes) ──
const WO_DEFAULTS = {
  msme_support: {
    objective: `To mobilise assigned MSMEs (up to 65 per peer-to-peer group) for peer-to-peer learning sessions, onboard them onto a suitable CRM platform based on their individual interest and business needs (such as Message Carrier, Brevo, or an equivalent tool), ensure their customer information is accurate and up to date, unlock sales opportunities, and provide structured 1-on-1 business development support.`,
    key_tasks: `1. Mobilise assigned MSMEs by reaching out, explaining session objectives, and confirming participation dates and location.
2. Document any MSME that is unavailable or declines in the non-engagement register and notify the Senior BGE promptly.
3. Assess each MSME's interest, digital capacity, and business needs to recommend the most appropriate CRM platform.
4. Ensure all CRM account login credentials are handed directly to the MSME owner and not stored by the BGE.
5. Assist each MSME in configuring their chosen CRM system by helping them input, structure, and verify their customer contact list.
6. Work with each MSME to identify and unlock sales opportunities using their updated customer data.
7. Conduct a structured 1-on-1 session with each assigned MSME using the standardised PRUDEV II session template.
8. Attend and actively participate in the peer-to-peer learning sessions, supporting facilitation and ensuring MSMEs are engaged.
9. Maintain personal accountability for the accuracy and timely submission of all attendance sheets and field reports.
10. Document all field activities, session notes, and MSME progress in the required PRUDEV II formats.
11. Maintain confidentiality of all MSME data and business information at all times.`,
    deliverables_json: [
      { task_num: 1, description: 'MSME mobilisation list – names and contacts of all MSMEs confirmed for the peer-to-peer session', due_date: 'End of Week 1', quantitative_result: 'Mobilisation list submitted with names and contacts of all confirmed MSMEs', qualitative_result: 'List is accurate, complete, and submitted on time', means_of_verification: 'Submitted mobilisation list', unit_rate: '', payment_condition: 'Required for payment processing' },
      { task_num: 2, description: 'MSME non-engagement register – documented record of any MSME that was unavailable or declined', due_date: 'Rolling – within 2 days of each contact attempt', quantitative_result: '100% of non-engaging MSMEs documented within 2 days of each contact attempt', qualitative_result: 'Register is complete with reasons documented and Senior BGE notified promptly', means_of_verification: 'Completed non-engagement register', unit_rate: '', payment_condition: 'Included in monthly deliverable' },
      { task_num: 3, description: 'Signed MSME registration forms for the selected CRM platform', due_date: 'Rolling – per MSME onboarded', quantitative_result: 'Signed registration form submitted for each onboarded MSME', qualitative_result: 'Forms are accurate, complete, and submitted within the required timeline', means_of_verification: 'Signed CRM registration forms per MSME', unit_rate: '', payment_condition: 'Per MSME onboarded and verified' },
      { task_num: 4, description: 'CRM set-up confirmation report – evidence that each MSME has an active account and customer list uploaded', due_date: 'End of Week 2', quantitative_result: 'CRM set-up confirmation report submitted with evidence of active accounts for all assigned MSMEs', qualitative_result: 'Report demonstrates that each MSME has an active account with a verified customer list uploaded', means_of_verification: 'CRM set-up confirmation report with screenshots or system evidence', unit_rate: '', payment_condition: 'Pay only if set-up confirmed for minimum 80% of assigned MSMEs' },
      { task_num: 5, description: 'Updated customer list per MSME – cleaned, verified, and entered into the CRM system', due_date: 'End of Week 2', quantitative_result: 'Customer list updated and verified for each assigned MSME', qualitative_result: 'Lists are cleaned, structured, and accurately entered into the CRM system', means_of_verification: 'CRM system records showing updated customer lists per MSME', unit_rate: '', payment_condition: 'Pay only if both quantitative and qualitative targets are achieved' },
      { task_num: 6, description: '1-on-1 session notes for each MSME (using standardised PRUDEV II template)', due_date: 'Within 2 days of each session', quantitative_result: '1-on-1 session notes submitted for each assigned MSME within 2 days', qualitative_result: 'Notes capture key business challenges, agreed actions, and MSME progress using the PRUDEV II template', means_of_verification: 'Completed session notes using PRUDEV II template', unit_rate: '', payment_condition: 'Pay only if submitted within required timeline' },
      { task_num: 7, description: 'Signed peer-to-peer session attendance sheets submitted to the Senior BGE', due_date: 'Per session, day of event', quantitative_result: 'Signed attendance sheet submitted for every peer-to-peer session on the day of the event', qualitative_result: 'Attendance sheets are complete, legible, and accurately reflect participation', means_of_verification: 'Original signed attendance sheets', unit_rate: '', payment_condition: 'Required for payment — must be submitted on the day of each session' },
      { task_num: 8, description: 'Monthly field activity report covering CRM adoption, sessions conducted, and key MSME challenges', due_date: 'Last working day of each month', quantitative_result: 'Monthly field activity report submitted by the last working day of each month', qualitative_result: 'Report clearly covers CRM adoption rates, sessions conducted, key MSME challenges, and recommended actions', means_of_verification: 'Submitted monthly field activity report', unit_rate: '', payment_condition: 'Pay only if report submitted on time and approved' },
      { task_num: 9, description: 'Approved invoice and signed timesheet', due_date: 'With monthly report submission', quantitative_result: '1 invoice and 1 signed timesheet submitted monthly with the report', qualitative_result: 'Invoice and timesheet accurately reflect days worked and are consistent with work order terms', means_of_verification: 'Approved invoice and countersigned timesheet', unit_rate: '', payment_condition: 'Payment processed upon approval of monthly deliverables' },
    ],
  },
  msme_data_update: {
    objective: `To support the updating and validation of MSME records within the BDS system through field visits, ensuring that business profiles, operational data, and compliance information are accurate, complete, and up to date.`,
    key_tasks: `1. Participate in orientation and training to fully understand the BDS system, data collection process, and reporting expectations.
2. Receive field materials including branded T-shirts and assignment guidelines.
3. Visit assigned MSMEs (approximately 10 per BGE) to conduct detailed data verification and updates.
4. Review and update MSME business profiles including ownership, location, products/services, staffing, and operational status.
5. Verify and update business registration and compliance information where applicable.
6. Capture updated contact details, customer channels, and digital presence information.
7. Update financial, production, and market-related information in the BDS system.
8. Identify missing or inconsistent records and validate information directly with MSME owners/managers.
9. Upload and synchronize all verified updates into the BDS system accurately and in a timely manner.
10. Submit feedback on challenges, observations, and recommendations arising from the field verification process.`,
    deliverables_json: [
      { task_num: 1, description: 'Orientation on the BDS System and Assignment Expectations Completed', due_date: 'Day 1', quantitative_result: 'BGE confirms full understanding of BDS system and assignment expectations on Day 1', qualitative_result: 'BGE demonstrates readiness to conduct field visits independently', means_of_verification: 'Signed orientation confirmation', unit_rate: '', payment_condition: 'Required prerequisite — no separate payment' },
      { task_num: 2, description: 'Distribution of Field Materials and Branded T-Shirts', due_date: 'Day 1', quantitative_result: 'Field materials and T-shirt received on Day 1', qualitative_result: 'BGE acknowledges receipt and agrees to wear branded T-shirt during all field visits', means_of_verification: 'Signed receipt of materials', unit_rate: '', payment_condition: 'Required prerequisite — no separate payment' },
      { task_num: 3, description: 'Assigned MSME Visit Plan', due_date: 'Day 1', quantitative_result: 'Visit plan covering all assigned MSMEs submitted on Day 1', qualitative_result: 'Plan is realistic, logically sequenced, and accounts for geography and scheduling constraints', means_of_verification: 'Submitted visit plan with MSME names, dates, and locations', unit_rate: '', payment_condition: 'Required before field visits commence' },
      { task_num: 4, description: 'MSME Field Visits and Data Collection Conducted', due_date: 'Day 2 – Day 5', quantitative_result: 'All assigned MSMEs visited and data collected (minimum 10 MSMEs)', qualitative_result: 'Data is accurate, complete, and validated directly with MSME owners or managers', means_of_verification: 'Field visit records and completed data collection forms', unit_rate: '', payment_condition: 'Pay only if minimum 80% of assigned MSMEs visited and data submitted' },
      { task_num: 5, description: 'Verified and Updated MSME Records in the BDS System', due_date: 'Day 2 – Day 5', quantitative_result: 'All MSME records updated and synchronised in the BDS system within the assignment period', qualitative_result: 'Records are accurate, consistent, and free of missing or duplicate entries', means_of_verification: 'Updated BDS system records with timestamps of last update', unit_rate: '', payment_condition: 'Pay only if both quantitative and qualitative targets are achieved' },
      { task_num: 6, description: 'Summary Report on Key Findings, Gaps, and Recommendations', due_date: 'Final Day', quantitative_result: '1 summary report submitted on the final day covering all visited MSMEs', qualitative_result: 'Report clearly identifies gaps, key findings, and actionable recommendations', means_of_verification: 'Submitted summary report', unit_rate: '', payment_condition: 'Pay only if submitted on final day and approved' },
      { task_num: 7, description: 'Submission of Supporting Documentation and Completed Updates', due_date: 'Final Day', quantitative_result: 'All supporting documents submitted on the final day of the assignment', qualitative_result: 'Documents are complete, legible, and correctly organised', means_of_verification: 'Complete submission package of supporting documentation', unit_rate: '', payment_condition: 'Payment processed upon approval of all submitted documents' },
    ],
  },
  msme_finance_survey: {
    objective: `To support the collection and updating of MSME financial and business data through structured field visits using the Google Forms data collection tool, ensuring accurate and complete records within the BDS system.`,
    key_tasks: `1. Participate in orientation and training on the finance questionnaire, Google Forms tool, and field data collection procedures.
2. Receive assignment guidelines, field materials, and branded T-shirts.
3. Conduct field visits to at least 25 assigned MSMEs over a 15-day period.
4. Administer the finance questionnaire using the Google Forms platform.
5. Verify and update key MSME data: business ownership and contact details, sales and revenue, employment and staffing, production and operational capacity, market access and customer information, and business registration / compliance status.
6. Validate existing BDS records and correct any missing or inaccurate information.
7. Upload and synchronize collected data accurately and on time.
8. Provide daily progress updates and field feedback to the coordination team.
9. Identify MSMEs requiring additional business development or financial support services.`,
    deliverables_json: [
      { task_num: 1, description: 'Orientation on Finance Questionnaire and Google Forms Tool Completed', due_date: 'Monday, 18 May 2026', quantitative_result: 'BGE confirms full understanding of finance questionnaire and Google Forms tool on Day 1', qualitative_result: 'BGE demonstrates ability to administer the questionnaire independently', means_of_verification: 'Signed orientation confirmation', unit_rate: '', payment_condition: 'Required prerequisite — no separate payment' },
      { task_num: 2, description: 'Distribution of Field Materials and Branded T-Shirts', due_date: 'Monday, 18 May 2026', quantitative_result: 'Field materials and T-shirt received on Day 1', qualitative_result: 'BGE acknowledges receipt and agrees to wear branded T-shirt during all field visits', means_of_verification: 'Signed receipt of materials', unit_rate: '', payment_condition: 'Required prerequisite — no separate payment' },
      { task_num: 3, description: 'MSME Field Visit Schedule and Assignment Plan', due_date: 'Monday, 18 May 2026', quantitative_result: 'Assignment plan with field schedule for at least 25 MSMEs submitted on Day 1', qualitative_result: 'Plan is logically sequenced and accounts for geography and scheduling constraints', means_of_verification: 'Submitted field visit schedule with MSME names, dates, and locations', unit_rate: '', payment_condition: 'Required before field visits commence' },
      { task_num: 4, description: 'Completion of Field Visits to at Least 25 MSMEs', due_date: '19 May – 31 May 2026', quantitative_result: 'Minimum 25 MSME field visits completed between 19 May – 31 May 2026', qualitative_result: 'Visits are structured, data collected is accurate, and MSMEs are adequately engaged', means_of_verification: 'Field visit logs and completed finance questionnaire submissions', unit_rate: '', payment_condition: 'Pay only if minimum 25 visits completed and verified' },
      { task_num: 5, description: 'Completed Finance Questionnaires Submitted through Google Forms', due_date: '19 May – 31 May 2026', quantitative_result: 'Finance questionnaire submitted for each visited MSME through Google Forms', qualitative_result: 'Questionnaires are complete, accurate, and submitted within 24 hours of each visit', means_of_verification: 'Google Forms submission records with timestamps', unit_rate: '', payment_condition: 'Pay only if both quantitative and qualitative targets are achieved' },
      { task_num: 6, description: 'Updated MSME Records in the BDS System', due_date: 'Throughout Assignment Period', quantitative_result: 'BDS system records updated for all visited MSMEs throughout the assignment period', qualitative_result: 'Records are accurate, consistent, and reflect the latest verified information', means_of_verification: 'Updated BDS system records with timestamps', unit_rate: '', payment_condition: 'Pay only if records updated and verified for minimum 80% of visited MSMEs' },
      { task_num: 7, description: 'Daily Progress Updates Submitted', due_date: 'Daily', quantitative_result: 'Daily progress update submitted for every working day of the assignment', qualitative_result: 'Updates are informative, timely, and flag any challenges or issues requiring attention', means_of_verification: 'Daily update messages or reports received by coordination team', unit_rate: '', payment_condition: 'Required for payment — consistent updates demonstrate active engagement' },
      { task_num: 8, description: 'Final Summary Report with Key Findings and Recommendations', due_date: 'Monday, 1 June 2026', quantitative_result: '1 final summary report submitted by Monday, 1 June 2026', qualitative_result: 'Report provides clear key findings, data quality observations, and actionable recommendations', means_of_verification: 'Submitted and approved final summary report', unit_rate: '', payment_condition: 'Pay only if submitted on time and approved' },
      { task_num: 9, description: 'Submission of All Verified and Updated MSME Data', due_date: 'Monday, 1 June 2026', quantitative_result: 'All verified MSME data submitted by Monday, 1 June 2026', qualitative_result: 'Data is accurate, complete, and formatted per PRUDEV II standards', means_of_verification: 'Verified MSME data submission confirmed by coordination team', unit_rate: '', payment_condition: 'Payment processed upon approval of final submission' },
    ],
  },
  msme_access_finance: {
    objective: `To increase access to finance by digitizing the MSMEs and making them bankable through the credit and digital payment ecosystem. Each BGE will work with 15 assigned MSMEs from Cohort 1 and Cohort 2 over 7 working days, onboarding businesses onto digital financial platforms and mapping their interest in credit products for follow-up engagement.`,
    key_tasks: `1. Attend orientation on the Access to Finance assignment, digital financial tools, and reporting expectations.
2. Receive the list of 15 assigned MSMEs from Cohort 1 and Cohort 2 and develop a field visit plan.
3. Visit each assigned MSME and onboard them onto at least two (2) of the following digital financial platforms:
   • MOMO Pays
   • Flexy Pay
   • Wendi
   • Online Banking
   • Online Payments
   • Business Accounts
4. Document the specific platforms each MSME has been onboarded onto and capture evidence of registration (screenshots, confirmation messages, or account details).
5. Conduct a credit needs assessment with each MSME — identify which credit product the MSME is interested in and from which financial institution.
6. Compile a Credit Interest Mapping Report summarising MSME interest by product type, financial institution, and readiness level, to guide further engagement and follow-up.
7. Document all field activities and MSME progress in the required PRUDEV II formats.
8. Submit daily progress updates to the BDS Component Coordinator.
9. Flag any MSMEs with barriers to digital onboarding (no smartphone, no ID, etc.) and document in the barrier register.
10. Maintain confidentiality of all MSME data and financial information at all times.
11. Submit completed invoice and signed timesheet with the final report.`,
    deliverables_json: [
      { task_num: 1, description: 'Orientation on Access to Finance Assignment and Digital Financial Tools Completed', due_date: '3 June 2026', quantitative_result: 'BGE confirms understanding of Access to Finance assignment and digital tools on Day 1', qualitative_result: 'BGE demonstrates readiness to conduct MSME onboarding and credit assessments independently', means_of_verification: 'Signed orientation confirmation', unit_rate: '', payment_condition: 'Required prerequisite — no separate payment' },
      { task_num: 2, description: 'MSME Visit Plan — assignment list of 15 MSMEs from Cohort 1 & Cohort 2 with field schedule', due_date: '3 June 2026', quantitative_result: 'Field visit plan for all 15 assigned MSMEs submitted on 3 June 2026', qualitative_result: 'Plan is logically sequenced with visit dates, MSME details, and geographic routing', means_of_verification: 'Submitted MSME visit plan', unit_rate: '', payment_condition: 'Required before field visits commence' },
      { task_num: 3, description: 'MSME Digital Platform Onboarding Records — minimum 2 platforms per MSME with registration evidence', due_date: 'Rolling — throughout assignment', quantitative_result: 'Minimum 2 digital financial platforms onboarded per MSME for all 15 assigned MSMEs', qualitative_result: 'Onboarding is complete, verified with the MSME owner, and platforms are active and accessible', means_of_verification: 'Onboarding records with platform names and evidence of registration per MSME', unit_rate: '', payment_condition: 'Pay only if minimum 2 platforms onboarded per MSME for at least 80% of assigned MSMEs' },
      { task_num: 4, description: 'Digital Platform Registration Evidence per MSME (screenshots / confirmations)', due_date: 'Rolling — per MSME onboarded', quantitative_result: 'Registration evidence submitted for each MSME and each platform onboarded', qualitative_result: 'Evidence is clear, legible, and confirms active account creation per platform', means_of_verification: 'Screenshots or confirmation messages per MSME per platform', unit_rate: '', payment_condition: 'Required for verification — included in onboarding deliverable' },
      { task_num: 5, description: 'Credit Interest Mapping Report — by MSME, product type, and financial institution with readiness assessment', due_date: '15 June 2026', quantitative_result: '1 credit interest mapping report covering all 15 MSMEs submitted by 15 June 2026', qualitative_result: 'Report accurately maps MSME interest by product type, financial institution, and readiness level with actionable follow-up recommendations', means_of_verification: 'Submitted credit interest mapping report', unit_rate: '', payment_condition: 'Pay only if submitted on time and approved' },
      { task_num: 6, description: 'Barrier Register — MSMEs with obstacles to digital onboarding and recommended follow-up', due_date: '15 June 2026', quantitative_result: 'All MSMEs with barriers to digital onboarding documented in the barrier register by 15 June 2026', qualitative_result: 'Register is complete, identifies specific barriers per MSME, and includes recommended follow-up actions', means_of_verification: 'Completed barrier register', unit_rate: '', payment_condition: 'Required for payment — demonstrates thorough field engagement' },
      { task_num: 7, description: 'Final Access to Finance Field Report — summary of onboarding outcomes, credit interest, observations, and recommendations', due_date: '16 June 2026', quantitative_result: '1 final field report submitted by 16 June 2026', qualitative_result: 'Report provides a comprehensive summary of onboarding outcomes, credit interest mapping, challenges, and recommendations', means_of_verification: 'Submitted and approved final field report', unit_rate: '', payment_condition: 'Pay only if submitted on time and approved' },
      { task_num: 8, description: 'Approved Invoice and Signed Timesheet', due_date: '16 June 2026', quantitative_result: '1 invoice and 1 signed timesheet submitted by 16 June 2026', qualitative_result: 'Invoice and timesheet accurately reflect days worked and are consistent with work order terms', means_of_verification: 'Approved invoice and countersigned timesheet', unit_rate: '', payment_condition: 'Payment processed upon approval of all deliverables' },
    ],
  },
  access_to_finance_bge: {
    objective: `To increase access to finance for assigned MSMEs in Gulu and Adjumani by assessing their credit readiness, preparing bankable documents, and linking creditworthy businesses to appropriate banks and financial service providers (FSPs). The BGE will work directly with MSMEs through one-on-one visits and credit clinics, collaborating with bank credit officers and accompanying bank staff to MSME premises for further credit assessment. The assignment runs for 10 working days (12–25 August 2026).

Targets per BGE (standard — Adjumani BGEs have higher targets, noted below):
• Credit readiness assessment: 5 MSMEs (Adjumani: 10)
• Bankable documents prepared: 6 MSMEs (Adjumani/Mali: 7)
• MSMEs linked/walked to bank or FSP: 4 (Adjumani: 5)
• MSMEs qualifying for financial clinic: at least 4`,
    key_tasks: `1. Receive the list of assigned MSMEs and develop a field visit and engagement plan covering the full 10-day assignment period.
2. Conduct one-on-one visits with each assigned MSME to assess their credit readiness — evaluate business records, cash flow, collateral, credit history, and existing bank relationships.
3. Complete the TA Assessment Tool report for every MSME visited (use the link shared during the last deployment — this is mandatory at every visit).
4. Support MSMEs to prepare bankable documents — including business registration, financial statements, business plans, loan application forms, and any other documents required by their preferred FSP.
5. Identify MSMEs who are ready for credit and link or accompany them to their relevant bank or FSP. Where possible, lead bank staff directly to the MSME's business premises for further credit assessment.
6. Liaise with the credit officer of the specific bank the MSME has a relationship with, and coordinate the bank's field assessment visit to the MSME location.
7. Record and report on the number of MSMEs who open accounts, activate mobile wallets, or are appraised for loans and risk assessment — this number determines the size of the financial clinic to be organised.
8. Participate in the credit/financial clinic to be organised for qualifying MSMEs (BGE participation is mandatory).
9. Submit a signed timesheet for each MSME visit (timesheet must be signed by the MSME owner at point of visit).
10. Complete the transport refund form (signed by the boda boda operator where boda transport was used).
11. Submit the final report, invoice, and all supporting evidence by Day 10.`,
    deliverables_json: [
      {
        task_num: 1,
        description: 'Field visit and engagement plan covering all assigned MSMEs',
        due_date: 'Day 1',
        quantitative_result: 'Plan submitted covering all assigned MSMEs with schedule and approach',
        qualitative_result: 'Plan is clear, realistic, and approved before field visits begin',
        means_of_verification: 'Submitted engagement plan',
        unit_rate: '',
        payment_condition: 'Required before field activities begin — no separate payment',
      },
      {
        task_num: 2,
        description: 'Credit readiness assessments completed — 5 MSMEs (Adjumani: 10)',
        due_date: 'Days 1–8',
        quantitative_result: '5 MSMEs assessed for credit readiness (Adjumani BGEs: 10 MSMEs)',
        qualitative_result: 'Each assessment clearly identifies readiness level, key gaps, and recommended next steps',
        means_of_verification: 'Completed TA Assessment Tool reports per MSME + signed visit timesheets',
        unit_rate: '',
        payment_condition: 'Pay only if TA Assessment Tool reports are completed for each MSME visited',
      },
      {
        task_num: 3,
        description: 'TA Assessment Tool reports submitted for all MSMEs visited',
        due_date: 'Rolling — submitted after each visit',
        quantitative_result: 'One TA Assessment Tool report per MSME visited (minimum: all credit-assessed MSMEs)',
        qualitative_result: 'Reports are complete, accurate, and clearly document the MSME\'s situation at point of visit',
        means_of_verification: 'TA Assessment Tool reports (using link shared during last deployment)',
        unit_rate: '',
        payment_condition: 'Mandatory for payment — missing reports will delay payment',
      },
      {
        task_num: 4,
        description: 'Bankable documents prepared — 6 MSMEs (Adjumani/Mali: 7)',
        due_date: 'Days 2–9',
        quantitative_result: '6 MSMEs with bankable documents prepared (Adjumani/Mali BGEs: 7 MSMEs)',
        qualitative_result: 'Documents are complete, correctly formatted, and accepted by the relevant FSP',
        means_of_verification: 'Copies of documents prepared per MSME included in final report',
        unit_rate: '',
        payment_condition: 'Pay only if document preparation is evidenced for the required number of MSMEs',
      },
      {
        task_num: 5,
        description: 'MSMEs linked or walked to bank/FSP for credit — 4 MSMEs (Adjumani: 5)',
        due_date: 'Days 5–10',
        quantitative_result: '4 MSMEs linked to or accompanied to their bank/FSP (Adjumani BGEs: 5 MSMEs)',
        qualitative_result: 'Each MSME has been walked through the FSP engagement process or led a bank field visit to their premises',
        means_of_verification: 'Photos, bank visit records, or signed confirmation from credit officer',
        unit_rate: '',
        payment_condition: 'Pay only if linkage evidence is provided for the required number of MSMEs',
      },
      {
        task_num: 6,
        description: 'Report on MSMEs qualifying for financial clinic (minimum 4 per BGE)',
        due_date: 'Day 9',
        quantitative_result: 'At least 4 MSMEs identified as qualifying for the financial clinic',
        qualitative_result: 'Report clearly identifies which MSMEs qualify (opened accounts, activated mobile wallets, or appraised for loans) and provides basis for clinic planning',
        means_of_verification: 'Qualifying MSME list included in final report with supporting evidence',
        unit_rate: '',
        payment_condition: 'Required for clinic organisation — no separate payment',
      },
      {
        task_num: 7,
        description: 'Participation in the financial/credit clinic for qualifying MSMEs',
        due_date: 'As scheduled',
        quantitative_result: 'BGE attended and participated in the financial clinic',
        qualitative_result: 'BGE contributed meaningfully to the clinic, supported their assigned MSMEs during the session',
        means_of_verification: 'Signed clinic attendance register',
        unit_rate: '',
        payment_condition: 'BGE participation is mandatory — non-attendance without approval may affect payment',
      },
      {
        task_num: 8,
        description: 'Signed MSME visit timesheets for all field visits',
        due_date: 'Rolling — collected at each visit',
        quantitative_result: 'One signed timesheet per MSME visit (signed by MSME owner at point of visit)',
        qualitative_result: 'Timesheets are complete and signed at time of visit — retrospective signing not accepted',
        means_of_verification: 'Original signed timesheets submitted with final report',
        unit_rate: '',
        payment_condition: 'Missing timesheets will delay payment',
      },
      {
        task_num: 9,
        description: 'Transport refund form signed by boda boda operator (where applicable)',
        due_date: 'Day 10',
        quantitative_result: 'Transport refund form completed and signed by boda boda operator for all applicable trips',
        qualitative_result: 'Form accurately reflects trips taken and is signed at point of travel',
        means_of_verification: 'Completed and signed transport refund form',
        unit_rate: '',
        payment_condition: 'Required for transport reimbursement — unsigned forms will not be processed',
      },
      {
        task_num: 10,
        description: 'Final report including all evidence of work done',
        due_date: 'Day 10',
        quantitative_result: 'Final report submitted by Day 10 covering all assigned MSMEs, activities, outcomes, and evidence',
        qualitative_result: 'Report is clear, comprehensive, and supported by photographic and documentary evidence',
        means_of_verification: 'Submitted final report reviewed and approved by Team Leader',
        unit_rate: '',
        payment_condition: 'Payment processed upon approval of final report',
      },
      {
        task_num: 11,
        description: 'Approved invoice',
        due_date: 'Day 10',
        quantitative_result: 'Invoice submitted by Day 10 reflecting the 10-day assignment',
        qualitative_result: 'Invoice is accurate, correctly formatted, and matches the approved deliverables',
        means_of_verification: 'Approved invoice',
        unit_rate: '',
        payment_condition: 'Processed together with final report approval',
      },
    ],
  },
  biz_continuity: {
    objective: `To support Jacob, the Senior BGE, in preparing and delivering a Business Continuity Planning process for assigned agro-processors. This includes 3 days to build the necessary tools and materials, followed by 4 days to deliver the process through a group preparation session, direct MSME engagement, and final plan delivery. The assignment will help MSMEs build practical, business-specific Business Continuity Plans that can be used immediately in times of disruption.`,
    key_tasks: `The Senior BGE will carry out the following over 7 working days:

1. Days 1–3 — Tool Development and Preparation
• Develop the Business Continuity Planning tools and materials needed for delivery.
• Prepare the templates, session outlines, and supporting documents required for the process.
• Ensure the tools are practical, context-appropriate, and ready for use with MSMEs.

2. Day 4 — Group Preparation Session
• Facilitate a preparatory session with a group of MSMEs to introduce the Business Continuity Planning process and prepare participants for the assignment.
• Explain the purpose of the exercise, expected outputs, roles, and the flow of the next engagement days.
• Agree on the schedule and approach for the MSME engagement activities.

3. Days 5 & 6 — MSME Engagement and Input Collection
• Engage directly with MSMEs to gather business-specific inputs on operations, risks, critical functions, dependencies, and recovery needs.
• Guide the MSMEs through the key planning steps and document their responses using the PRUDEV II templates.
• Capture practical information needed to develop a realistic Business Continuity Plan.

4. Day 7 — Finalisation and Delivery
• Review all collected information, finalise the Business Continuity Plan, and deliver it to the MSMEs.
• Conduct a short training session to explain the plan, assigned roles, and next steps.
• Present the final document and close the assignment.

Budget estimate:
• UGX 60,000 for the tool development and preparation days on Days 1–3
• UGX 60,000 for the group preparation session on Day 4
• UGX 60,000 x 2 for the two days of direct MSME engagement on Days 5 and 6
• UGX 60,000 for the final training and delivery day on Day 7`,
    deliverables_json: [
      {
        task_num: 1,
        description: 'Business Continuity Planning tools and materials developed for delivery, including the required templates and session support documents',
        due_date: 'Days 1–3',
        quantitative_result: 'Tools and materials completed for delivery across the 3 preparation days; budget estimate UGX 60,000',
        qualitative_result: 'The tools are practical, clear, and suitable for use with MSMEs during the delivery process',
        means_of_verification: 'Completed tool package and preparation records',
        unit_rate: '',
        payment_condition: 'Required before delivery activities commence',
      },
      {
        task_num: 2,
        description: 'Group preparation session completed with a group of MSMEs to introduce the Business Continuity Planning process and prepare participants for the assignment',
        due_date: 'Day 4',
        quantitative_result: '1 preparatory group session completed; budget estimate UGX 60,000',
        qualitative_result: 'The session is well organised, MSMEs understand the process, and participants are ready for the engagement days that follow',
        means_of_verification: 'Signed attendance register and session notes',
        unit_rate: '',
        payment_condition: 'Required for the assignment to proceed',
      },
      {
        task_num: 3,
        description: 'MSME engagement day 1 completed with business-specific input collection for the Business Continuity Plan',
        due_date: 'Day 5',
        quantitative_result: '1 day of direct MSME engagement completed; budget estimate UGX 60,000',
        qualitative_result: 'The engagement yields practical business inputs and clear information on critical functions, risks, and dependencies',
        means_of_verification: 'Signed attendance sheet and completed engagement notes',
        unit_rate: '',
        payment_condition: 'Required to support the next engagement day and final plan development',
      },
      {
        task_num: 4,
        description: 'MSME engagement day 2 completed with further input collection and refinement of the Business Continuity Plan content',
        due_date: 'Day 6',
        quantitative_result: '1 additional day of direct MSME engagement completed; budget estimate UGX 60,000',
        qualitative_result: 'The second engagement day adds clarity, confirms priorities, and strengthens the draft plan content',
        means_of_verification: 'Signed attendance sheet and updated engagement notes',
        unit_rate: '',
        payment_condition: 'Required to support finalisation of the full Business Continuity Plan',
      },
      {
        task_num: 5,
        description: 'Final Business Continuity Plan delivered and trained to the MSMEs, including the completed document and a short delivery session',
        due_date: 'Day 7',
        quantitative_result: '1 full Business Continuity Plan delivered; training and delivery session completed; budget estimate UGX 60,000',
        qualitative_result: 'The final plan is practical, clearly explained, and understood by the MSMEs and their key staff',
        means_of_verification: 'Submitted final plan, signed delivery record, and training attendance sheet',
        unit_rate: '',
        payment_condition: 'Full payment processed upon completion of the final plan and delivery session',
      },
    ],
  },
  mobilisation: {
    objective: `To mobilise and confirm participation of selected applicants for the scheduled programme. The BGE will conduct structured telephone outreach to confirm interest, clarify programme expectations, verify qualifications and readiness, gather required information, and address any concerns or logistical barriers.`,
    key_tasks: `1. Telephone outreach to confirm applicant participation using the list provided by the BDS Component Coordinator.
2. Clarify programme expectations – this is NOT a job offer; it is training to build their own business.
3. Gather applicant information: full name, contact number, district, qualifications, smartphone access, and logistics concerns.
4. Identify and flag barriers to participation (transport, accommodation, timing) and document in the barrier report.
5. Provide follow-up SMS reminders to confirmed participants with dates, venue details, and what to bring.
6. Track confirmed vs. declined applicants and provide updates to the BDS Component Coordinator.`,
    deliverables_json: [
      { task_num: 1, description: 'Daily Call Log – record of each call made, time, outcome, and notes', due_date: 'Daily', quantitative_result: 'Daily call log submitted for every working day of the mobilisation period', qualitative_result: 'Log records each call with time, outcome, and notes — no calls omitted', means_of_verification: 'Submitted daily call logs', unit_rate: '', payment_condition: 'Required for payment — demonstrates consistent outreach effort' },
      { task_num: 2, description: 'Applicant Information Sheet – confirmed participants, qualifications verified, logistics information', due_date: 'End of mobilisation period', quantitative_result: 'Applicant information sheet submitted by end of mobilisation period with all confirmed participants', qualitative_result: 'Sheet captures full name, contact number, district, qualifications, smartphone access, and logistics information for each confirmed applicant', means_of_verification: 'Completed applicant information sheet', unit_rate: '', payment_condition: 'Pay only if submitted on time and verified' },
      { task_num: 3, description: 'Barrier Report – summary of identified barriers and recommendations for support', due_date: 'End of mobilisation period', quantitative_result: 'Barrier report submitted by end of mobilisation period covering all identified challenges', qualitative_result: 'Report clearly identifies barriers by category and provides specific, actionable recommendations', means_of_verification: 'Submitted barrier report', unit_rate: '', payment_condition: 'Pay only if submitted on time and approved' },
      { task_num: 4, description: 'Final Mobilisation Summary Report – confirmation rates, analysis of no-shows/declines, final participant count', due_date: 'Day after mobilisation closes', quantitative_result: 'Final mobilisation summary report submitted the day after mobilisation closes', qualitative_result: 'Report provides accurate confirmation rates, analysis of no-shows and declines, and final verified participant count', means_of_verification: 'Submitted and approved final mobilisation summary report', unit_rate: '', payment_condition: 'Payment processed upon approval of final report' },
    ],
  },
  group_session: {
    objective: `To facilitate and document peer-to-peer learning sessions with assigned MSME groups. The BGE will ensure effective knowledge sharing, monitor MSME engagement and progress, and submit timely session reports.`,
    key_tasks: `1. Prepare session materials and agenda in line with PRUDEV II session templates.
2. Facilitate the peer-to-peer group session, ensuring all assigned MSMEs are engaged and participate actively.
3. Document attendance and participation using the official PRUDEV II attendance sheet.
4. Capture key discussions, challenges raised, and outcomes agreed during the session.
5. Support individual MSMEs with queries or follow-up actions arising from the session.
6. Submit session notes and attendance records within the required timelines.`,
    deliverables_json: [
      { task_num: 1, description: 'Signed attendance sheet – original submitted to Senior BGE on the day of the session', due_date: 'Day of session', quantitative_result: 'Signed attendance sheet submitted to Senior BGE on the day of every session', qualitative_result: 'Sheet is complete, legible, and accurately captures all attendees', means_of_verification: 'Original signed attendance sheet', unit_rate: '', payment_condition: 'Required for payment — must be submitted on the day of each session' },
      { task_num: 2, description: 'Session notes – key topics discussed, challenges raised, and agreed follow-up actions', due_date: 'Within 2 days of session', quantitative_result: 'Session notes submitted within 2 days of every peer-to-peer session', qualitative_result: 'Notes cover key topics discussed, challenges raised, outcomes agreed, and next steps', means_of_verification: 'Submitted session notes using PRUDEV II template', unit_rate: '', payment_condition: 'Pay only if submitted within required timeline' },
      { task_num: 3, description: 'Individual MSME follow-up log – specific action points agreed with each MSME', due_date: 'Within 2 days of session', quantitative_result: 'Follow-up log submitted within 2 days of each session for all MSMEs who attended', qualitative_result: 'Log captures specific, actionable follow-up points agreed with each MSME', means_of_verification: 'Completed individual MSME follow-up log', unit_rate: '', payment_condition: 'Pay only if both quantitative and qualitative targets are achieved' },
    ],
  },
  outcome_assessment_tool: {
    objective: `To conduct an Outcome Assessment Tool visit with assigned MSMEs, document progress across agro-processing, energy use, and certification milestones, and submit findings for the PRUDEV II BDS team. The BGE will ensure each visit is practical, evidence-based, and focused on understanding the real impact of recent technical training, audits, and mentorship.`,
    key_tasks: `1. Contact the assigned MSME and agree a convenient visit date.
2. Explain the purpose of the Outcome Assessment Tool and confirm the MSME's consent for the visit.
3. Administer the assessment using the official form: https://forms.gle/UBXtrRgjGCmGsZnE8
4. Capture evidence of progress, system adoptions, and milestone achievements during the visit.
5. Submit the completed assessment and a short visit summary within the reporting timeline.`,
    deliverables_json: [
      { task_num: 1, description: 'Visit schedule confirmed with the MSME', due_date: 'Within 2 working days', quantitative_result: '1 confirmed visit schedule per MSME', qualitative_result: 'Schedule is mutually agreed and practicable', means_of_verification: 'Confirmation note or call log entry', unit_rate: '', payment_condition: 'Required for payment — must be documented' },
      { task_num: 2, description: 'Outcome Assessment Tool completed', due_date: 'Within 3 working days of visit', quantitative_result: '1 completed assessment form submitted for each visited MSME', qualitative_result: 'Assessment records progress, challenges, and key milestones clearly', means_of_verification: 'Submitted form response', unit_rate: '', payment_condition: 'Required for payment — must be submitted on time' },
      { task_num: 3, description: 'Visit summary report submitted', due_date: 'Within 5 working days of visit', quantitative_result: '1 visit summary report submitted per MSME', qualitative_result: 'Summary captures observations, evidence, and recommended next steps', means_of_verification: 'Submitted visit summary report', unit_rate: '', payment_condition: 'Pay only if submitted within required timeline' },
    ],
  },
  agro_biz_continuity: {
    objective: `To provide technical support during the training of Agro-processors in Business Continuity and Strategic Planning.`,
    key_tasks: `The BGE will:
i. Orient Participants on the Business Continuity Planning
ii. Facilitate Strategic Business Planning
iii. Evaluate Participant Learning
iv. Prepare the Workshop Report`,
    deliverables_json: [
      { task_num: 1, description: 'Two-day Business Continuity and Strategic Planning training successfully facilitated', due_date: '21st–24th July 2026', quantitative_result: '', qualitative_result: '', means_of_verification: 'Signed attendance register and session notes', unit_rate: '', payment_condition: '' },
      { task_num: 2, description: 'Participants trained on Business Continuity Management and Strategic Planning', due_date: '21st–24th July 2026', quantitative_result: '', qualitative_result: '', means_of_verification: 'Training attendance sheet', unit_rate: '', payment_condition: '' },
      { task_num: 3, description: 'Enterprise risk assessment exercises completed', due_date: '21st–24th July 2026', quantitative_result: '', qualitative_result: '', means_of_verification: 'Completed risk assessment worksheets', unit_rate: '', payment_condition: '' },
      { task_num: 4, description: 'Workshop report', due_date: '28th July 2026', quantitative_result: '', qualitative_result: '', means_of_verification: 'Submitted workshop report', unit_rate: '', payment_condition: 'Payment processed upon approval of workshop report' },
    ],
  },
  bcp_tool_training: {
    objective: `To participate in a capacity building training on the Business Continuity Planning (BCP) tool and develop the practical skills to apply it effectively when supporting assigned MSMEs in business continuity planning.`,
    key_tasks: `The BGE will:
i. Attend all BCP Tool training sessions punctually and participate actively throughout
ii. Complete all hands-on exercises, applying the BCP tool to assigned MSME scenarios during training
iii. Demonstrate understanding of the BCP tool through practical exercises facilitated by the Senior BGE
iv. Submit a post-training application note describing how the tool will be applied to at least one assigned MSME`,
    deliverables_json: [
      { task_num: 1, description: 'Full attendance at BCP Tool training sessions', due_date: 'Day of training', quantitative_result: 'BGE attends all scheduled training sessions', qualitative_result: 'Active and engaged participation throughout the training', means_of_verification: 'Signed attendance register', unit_rate: '', payment_condition: 'Required for payment — non-attendance forfeits fee' },
      { task_num: 2, description: 'Completed BCP Tool exercise submitted during training', due_date: 'Day of training', quantitative_result: '1 completed BCP tool exercise submitted', qualitative_result: 'Exercise demonstrates practical understanding of the tool', means_of_verification: 'Completed BCP tool exercise worksheet', unit_rate: '', payment_condition: 'Required for payment' },
      { task_num: 3, description: 'Post-training application note', due_date: 'Within 5 days of training', quantitative_result: '1 application note submitted describing planned BCP tool use with at least one MSME', qualitative_result: 'Note is specific, actionable, and grounded in the MSME context', means_of_verification: 'Submitted application note', unit_rate: '', payment_condition: 'Payment processed upon submission and approval' },
    ],
  },
  bge_bcp_participant_mentor: {
    objective: `To participate in the Business Continuity Plan (BCP) Tool Training (16–17 July 2026) and subsequently provide facilitation support to Agro-processors during the Business Continuity & Strategic Planning workshop sessions in Gulu (21–22 July 2026) and Lira (23–24 July 2026), assisting Agro-processing MSMEs in developing their Business Continuity Plans and Strategic Growth Plans.`,
    key_tasks: `The BGE will:
i. Attend the two-day BCP Tool Training (16–17 July 2026) and demonstrate understanding of the Business Continuity Planning tool and its application to Agro-processing enterprises
ii. Provide facilitation support at the Agro-processors Business Continuity & Strategic Planning workshop in Gulu (21–22 July 2026), guiding participants through BCP tool exercises and risk assessment activities
iii. Provide facilitation support at the Agro-processors Business Continuity & Strategic Planning workshop in Lira (23–24 July 2026), guiding participants through BCP tool exercises and risk assessment activities
iv. Support Agro-processing MSMEs in completing enterprise risk assessments and developing practical Business Continuity Plans under the guidance of the lead facilitator
v. Submit a post-workshop summary report within 5 working days of the final session in Lira`,
    deliverables_json: [
      { task_num: 1, description: 'Full attendance at BCP Tool Training', due_date: '16–17 July 2026', quantitative_result: 'BGE attends both days of the BCP Tool Training', qualitative_result: 'Active and engaged participation throughout; BGE demonstrates understanding of the BCP tool', means_of_verification: 'Signed attendance register', unit_rate: '', payment_condition: 'Required for payment — non-attendance forfeits fee' },
      { task_num: 2, description: 'Facilitation support at Agro-processors Business Continuity & Strategic Planning Workshop — Gulu', due_date: '21–22 July 2026', quantitative_result: 'BGE provides facilitation support for both days of the Gulu workshop', qualitative_result: 'Agro-processing MSMEs guided effectively through BCP tool exercises and risk assessment activities', means_of_verification: 'Signed attendance register and lead facilitator confirmation', unit_rate: '', payment_condition: 'Required for payment' },
      { task_num: 3, description: 'Facilitation support at Agro-processors Business Continuity & Strategic Planning Workshop — Lira', due_date: '23–24 July 2026', quantitative_result: 'BGE provides facilitation support for both days of the Lira workshop', qualitative_result: 'Agro-processing MSMEs guided effectively through BCP tool exercises and risk assessment activities', means_of_verification: 'Signed attendance register and lead facilitator confirmation', unit_rate: '', payment_condition: 'Required for payment' },
      { task_num: 4, description: 'Post-workshop summary report', due_date: 'Within 5 working days of 24 July 2026', quantitative_result: '1 summary report submitted covering observations from the training and both workshop locations', qualitative_result: 'Report captures key observations, Agro-processor challenges encountered, and recommended follow-up actions', means_of_verification: 'Submitted summary report approved by Team Leader', unit_rate: '', payment_condition: 'Payment processed upon submission and approval of report' },
    ],
  },
  bcp_senior_facilitator: {
    objective: `To lead the end-to-end design, preparation, and facilitation of the Business Continuity & Strategic Planning programme for Agro-processing MSMEs under PRUDEV II. The Senior BGE will develop the Business Continuity Planning (BCP) toolkit and all workshop materials, facilitate a two-day BGE capacity building training (16–17 July 2026), and lead workshop facilitation with Agro-processing MSMEs in Gulu (21–22 July 2026) and Lira (23–24 July 2026).`,
    key_tasks: `PHASE 1 — PREPARATION (Week of 8–14 July 2026)

i. Develop the Business Continuity Planning Toolkit and all workshop materials, including session guides, risk mapping matrices, business function templates, dependency mapping tools, BCP framework document, and facilitator notes.
ii. Prepare the BGE capacity building training content and session plans for the two-day BCP Tool Training.
iii. Conduct a pre-training briefing with all assigned BGEs on the BCP tool, their facilitation roles, and the workshop schedule for Gulu and Lira.
iv. Ensure all materials and logistics are confirmed and ready before the BGE training commences on 16 July 2026.

PHASE 2 — BGE CAPACITY BUILDING TRAINING (16–17 July 2026)

v. Facilitate the two-day BCP Tool Training for participating BGEs, equipping them with the practical skills to support MSME facilitation.
vi. Guide BGEs through hands-on exercises using the BCP tool, applying it to real Agro-processing MSME scenarios.
vii. Evaluate BGE understanding and readiness through practical exercises and observation.
viii. Collect participant feedback using the approved PRUDEV II feedback instrument and prepare a brief training report.

PHASE 3 — MSME WORKSHOP FACILITATION (21–24 July 2026)

ix. Facilitate the Business Continuity & Strategic Planning workshop with Agro-processing MSMEs in Gulu (21–22 July 2026), guiding participants through risk identification, business process mapping, BCP drafting, and strategic planning exercises.
x. Facilitate the Business Continuity & Strategic Planning workshop with Agro-processing MSMEs in Lira (23–24 July 2026), guiding participants through the same structured process.
xi. Support individual MSMEs in completing enterprise risk assessments and developing practical Business Continuity Plans and Strategic Growth Plans.
xii. Compile and submit a consolidated workshop report covering observations, participant outputs, and recommendations from all facilitation days.`,
    deliverables_json: [
      {
        task_num: 1,
        description: 'Business Continuity Planning Toolkit developed — including session guides, risk mapping matrices, business function templates, dependency mapping tools, BCP framework document, and facilitator notes',
        due_date: '14 July 2026',
        quantitative_result: '1 complete BCP Toolkit package delivered, covering all materials required for the BGE training and MSME workshops',
        qualitative_result: 'Toolkit is practical, contextually appropriate for Ugandan agro-processors, and ready for use without further revision; reviewed and confirmed before the BGE training begins',
        means_of_verification: 'Submitted BCP Toolkit package (soft copy)',
        unit_rate: '',
        payment_condition: 'Prerequisite for the programme — included in preparation week fees',
      },
      {
        task_num: 2,
        description: 'BGE capacity building training facilitated — all participating BGEs trained on the BCP tool and their facilitation roles',
        due_date: '16–17 July 2026',
        quantitative_result: 'Two-day BCP Tool Training delivered to all assigned BGEs; attendance register signed by all participants',
        qualitative_result: 'BGEs understand and can apply the BCP tool; training sessions are structured, practical, and meet PRUDEV II quality standards',
        means_of_verification: 'Signed attendance register and BGE training session notes',
        unit_rate: '',
        payment_condition: 'Required for payment — non-delivery forfeits preparation phase fees',
      },
      {
        task_num: 3,
        description: 'BGE training report submitted — covering objectives, activities, BGE competency observations, feedback summary, and readiness assessment',
        due_date: 'Within 5 days of 17 July 2026',
        quantitative_result: '1 training report submitted within 5 days of the final training day',
        qualitative_result: 'Report documents training content, BGE performance observations, feedback analysis, and confirms BGE readiness for MSME workshop facilitation',
        means_of_verification: 'Submitted training report approved by BDS Expert',
        unit_rate: '',
        payment_condition: 'Payment for Phase 2 processed upon approval of the training report',
      },
      {
        task_num: 4,
        description: 'MSME Business Continuity & Strategic Planning workshop facilitated in Gulu',
        due_date: '21–22 July 2026',
        quantitative_result: 'Two-day workshop facilitated with all enrolled Agro-processing MSMEs in Gulu; signed attendance register submitted',
        qualitative_result: 'Participants guided effectively through risk identification, business process mapping, BCP drafting, and strategic planning; workshop outputs are sufficient to support plan finalisation',
        means_of_verification: 'Signed Gulu attendance register and participant BCP and planning outputs',
        unit_rate: '',
        payment_condition: 'Required for payment — attendance register and participant outputs must be submitted',
      },
      {
        task_num: 5,
        description: 'MSME Business Continuity & Strategic Planning workshop facilitated in Lira',
        due_date: '23–24 July 2026',
        quantitative_result: 'Two-day workshop facilitated with all enrolled Agro-processing MSMEs in Lira; signed attendance register submitted',
        qualitative_result: 'Participants guided effectively through risk identification, business process mapping, BCP drafting, and strategic planning; workshop outputs are sufficient to support plan finalisation',
        means_of_verification: 'Signed Lira attendance register and participant BCP and planning outputs',
        unit_rate: '',
        payment_condition: 'Required for payment — attendance register and participant outputs must be submitted',
      },
      {
        task_num: 6,
        description: 'Consolidated workshop report submitted — covering the BGE training, Gulu workshop, and Lira workshop, with observations, participant outputs, and recommendations',
        due_date: 'Within 5 days of 24 July 2026',
        quantitative_result: '1 consolidated report submitted within 5 days of the final workshop day covering all three phases',
        qualitative_result: 'Report clearly documents what was achieved across all phases, the quality of participant outputs, and provides specific recommendations to support MSME plan finalisation',
        means_of_verification: 'Submitted and approved consolidated workshop report',
        unit_rate: '',
        payment_condition: 'Final payment processed upon approval of the consolidated report',
      },
      {
        task_num: 7,
        description: 'Approved invoice and signed timesheet submitted',
        due_date: 'With consolidated report',
        quantitative_result: '1 approved invoice and 1 signed timesheet reflecting 11 days worked (5 preparation + 2 BGE training + 4 MSME facilitation)',
        qualitative_result: 'Invoice and timesheet are accurate, consistent with the work order terms, and submitted alongside the consolidated report',
        means_of_verification: 'Approved invoice and countersigned timesheet',
        unit_rate: '',
        payment_condition: 'Payment processed upon approval of invoice, timesheet, and consolidated report',
      },
    ],
  },
  fi_mobilisation_bcp: {
    objective: `To develop a business continuity strategy and business operational plan for 05 agro-processors attached to you. These two documents are meant to help agro-processors to protect their businesses from disruptions.`,
    key_tasks: `1. Conduct a Business Impact Analysis (BIA): Identify time-sensitive operations, estimate the financial and operational impacts of disruptions, and determine their Maximum Tolerable Downtime (MTD) for critical processes.
2. Perform a Risk Assessment: Identify potential threats (e.g., inflation, raw material seasonality, cyberattacks, supply chain failures, natural disasters) and evaluate the probability and impact of each to prioritize mitigation efforts.
3. Develop Recovery Strategies: Outline specific, actionable steps to resume critical functions for the business.
4. Document the Plan: Create a clear, easily accessible written document detailing response procedures, team member roles and contact lists, communication protocols, among others.
5. Train and Test: Educate employees on their specific responsibilities during a crisis as per the strategy. Conduct a simulation exercise (tabletop or full-scale) to identify weaknesses and refine the strategy.`,
    deliverables_json: [
      { task_num: 1, description: 'Business continuity strategy and business operational plan submitted for each assigned agro-processor', due_date: '1 week after deployment', quantitative_result: 'Business continuity strategy and operational plan submitted for all assigned agro-processors within 1 week of deployment', qualitative_result: 'Plans are practical, tailored to each enterprise, and meet PRUDEV II quality standards', means_of_verification: 'Submitted business continuity strategy and operational plan (soft and hard copy)', unit_rate: '', payment_condition: 'Pay only if submitted within required timeline and approved by BDS Expert' },
      { task_num: 2, description: 'Non-engagement register — documented record of any MSME that was unavailable or declined engagement', due_date: 'Rolling — within 2 days of each attempted contact', quantitative_result: '100% of non-engaging MSMEs documented within 2 days of each attempted contact', qualitative_result: 'Register is complete with reasons documented and Senior BGE notified promptly', means_of_verification: 'Completed non-engagement register', unit_rate: '', payment_condition: 'Included in monthly deliverable — required for payment processing' },
      { task_num: 3, description: 'Close-out report submitted — covering activities, MSME engagement, and key findings', due_date: 'Within 02 days after submission of BCP plan', quantitative_result: '1 close-out report submitted within 02 days of the final BCP plan submission', qualitative_result: 'Report covers all assigned MSMEs, summarises activities, engagement challenges, and provides recommendations', means_of_verification: 'Submitted and approved close-out report', unit_rate: '', payment_condition: 'Payment processed upon approval of close-out report' },
      { task_num: 4, description: 'Approved invoice and signed timesheet', due_date: 'Within 02 days after submission of BCP plan', quantitative_result: '1 approved invoice and 1 signed timesheet submitted within 02 days of BCP plan submission', qualitative_result: 'Invoice and timesheet accurately reflect days worked and are consistent with work order terms', means_of_verification: 'Approved invoice and countersigned timesheet', unit_rate: '', payment_condition: 'Payment processed upon approval of invoice, timesheet, and close-out report' },
    ],
  },
  carbon_emissions_training: {
    objective: `To equip BGEs with practical skills in the Carbon Footprint Tool and Carbon Emissions Measurement Framework, enabling them to support MSMEs in understanding, measuring, and reducing their carbon emissions. Each BGE will demonstrate competency in using the tool, measuring emissions for themselves and at least 2 MSMEs, identifying emission hotspots, and building MSME motivation to reduce emissions by showing how emission reduction directly translates to cost savings — working towards PRUDEV II's target of at least 1% carbon emission reduction per MSME over 12 months.`,
    key_tasks: `1. Carbon Footprint Tool Orientation & Account Setup: Participate in practical training sessions on the Carbon Footprint Tool. Create your own account, navigate the full tool independently, and demonstrate ability to measure personal/operational carbon emissions. Each BGE must show demonstrable competency before proceeding to MSME onboarding.
2. MSME Account Creation & Baseline Measurement: Create accounts on the Carbon Footprint Tool for a minimum of 2 assigned MSMEs during the training period. Record baseline emissions data for each MSME, covering all relevant emission sources (energy, transport, waste, materials).
3. Emission Hotspot Analysis: Facilitate a structured review of each MSME's emission profile to identify the top emission hotspots. Document hotspots by category and link each to a specific operational cost within the MSME's business — demonstrating that emission sources are also cost centres.
4. Waste as a Unit of Emission: Conduct practical exercises with MSMEs on understanding waste as a measurable unit of carbon emission. Develop clear, MSME-specific cost reduction strategies linked to waste reduction, showing the dual benefit of cost savings and emission reduction.
5. Emission Mitigation & Reduction Planning: Co-develop an emission mitigation and reduction plan with each MSME, targeting a minimum 1% emissions reduction over 12 months. Plans must include specific actions, responsible parties, timelines, and expected cost savings — framed so the MSME is incentivised by the financial benefit.
6. BGE Coaching Competency Demonstration: Demonstrate the ability to coach an MSME owner through their emissions profile and cost reduction opportunities. Show how reducing operational costs (energy, waste, materials) simultaneously reduces carbon emissions — building MSME motivation to act without relying on regulatory pressure.`,
    deliverables_json: [
      { task_num: 1, description: 'BGE personal account created on the Carbon Footprint Tool and own baseline emissions measured and documented', due_date: 'During training (Day 1–2)', quantitative_result: '1 completed personal emissions profile per BGE', qualitative_result: 'BGE demonstrates independent ability to navigate the tool and interpret results', means_of_verification: 'Screenshot of completed account and emissions dashboard', unit_rate: '', payment_condition: 'Required as evidence of training completion' },
      { task_num: 2, description: 'Carbon Footprint Tool accounts created for a minimum of 2 MSMEs, with documented baseline emissions data', due_date: 'During training (Day 2–3)', quantitative_result: 'Minimum 2 MSME accounts with full baseline data recorded', qualitative_result: 'Data covers all major emission categories (energy, transport, waste, materials); figures verified with MSME owner', means_of_verification: 'Screenshots of completed MSME accounts and baseline emission reports', unit_rate: '', payment_condition: 'Pay only if minimum 2 MSME accounts are completed with full data' },
      { task_num: 3, description: 'Emission hotspot analysis for each enrolled MSME, with costs linked to emission sources', due_date: 'Within 1 day of baseline measurement', quantitative_result: '1 hotspot analysis per MSME, covering top 3 emission sources linked to operational costs', qualitative_result: 'Analysis is specific to the MSME\'s operations; MSME owner can identify their key emission-cost centres', means_of_verification: 'Completed hotspot analysis form per MSME, co-signed by BGE and MSME owner', unit_rate: '', payment_condition: 'Included in overall training deliverable' },
      { task_num: 4, description: 'Emission mitigation and reduction plan for each MSME, targeting ≥1% emissions reduction over 12 months', due_date: 'By end of field implementation period', quantitative_result: '1 emission reduction plan per MSME with specific actions, timelines, and projected cost savings', qualitative_result: 'Plan is practical and MSME-owned; cost savings are quantified and linked to emission reduction targets', means_of_verification: 'Signed emission mitigation and reduction plan (soft and hard copy) per MSME', unit_rate: '', payment_condition: 'Pay only if plan is completed and signed by both BGE and MSME owner' },
      { task_num: 5, description: 'Training completion report demonstrating BGE competency across all outcome areas', due_date: 'Within 2 days of end of training', quantitative_result: '1 training completion report per BGE covering all 6 competency areas', qualitative_result: 'Report provides evidence of demonstrable understanding across hotspot analysis, waste emissions, and MSME coaching', means_of_verification: 'Submitted and approved training completion report', unit_rate: '', payment_condition: 'Payment processed upon approval of training completion report' },
      { task_num: 6, description: 'Approved invoice and signed timesheet', due_date: 'Within 2 days of training completion', quantitative_result: '1 approved invoice and 1 signed timesheet submitted on time', qualitative_result: 'Invoice and timesheet accurately reflect days worked and are consistent with work order terms', means_of_verification: 'Approved invoice and countersigned timesheet', unit_rate: '', payment_condition: 'Payment processed upon approval of invoice, timesheet, and training completion report' },
    ],
  },
  csa_rapid_assessment: {
    objective: `To rapidly assess the quality of Climate Smart Agriculture (CSA) training delivered by Farm Enterprise Trainers (FETs), the quality and frequency of mentorship provided by FETs, adoption of CSA practices by group members at household level, technical backstopping provided by Agricultural Officers, and early evidence of changes in farming practices, productivity, resilience and sustainability.`,
    key_tasks: `The BGE will visit the assigned groups to carry out an assessment of Climate Smart Agriculture Activities through a Focus Group Discussion (FGD) with the farmer groups, triangulated through field observations and household spot checks.

Data Collection Tool (mandatory): https://ee-eu.kobotoolbox.org/x/HFlLk5ba
All assessment data must be submitted through the above KoboToolbox form.

Target: 2 farmer groups per day for 5 working days = 10 groups per BGE.`,
    deliverables_json: [
      {
        task_num: 1,
        description: 'CSA Assessment — completed FGDs with assigned farmer groups. Assess quality of CSA training by FETs, quality and frequency of FET mentorship, adoption of CSA practices at household level, technical backstopping by Agricultural Officers, and early evidence of changes in farming practices, productivity, resilience and sustainability.',
        due_date: 'Ongoing — 2 groups per day for 5 working days (10 groups total)',
        quantitative_result: '10 completed FGDs (2 groups/day × 5 days) submitted via KoboToolbox',
        qualitative_result: 'All data accurately captured using the standardised KoboToolbox form; field observations and household spot checks triangulated',
        means_of_verification: 'Submitted KoboToolbox records and signed group attendance sheets',
        unit_rate: 'UGX 60,000 per FGD day',
        payment_condition: 'Pay per approved FGD day, up to maximum 5 days',
      },
      {
        task_num: 2,
        description: 'Assessment Report — covering all assigned farmer groups, key findings on CSA adoption, mentorship quality, and evidence of changes in farming practices, productivity, resilience and sustainability.',
        due_date: 'Within 2 days after completion of the assignment',
        quantitative_result: '1 assessment report covering all 10 assigned groups submitted within 2 days of assignment completion',
        qualitative_result: 'Report is evidence-based, covers all groups, and addresses all assessment dimensions',
        means_of_verification: 'Submitted and approved assessment report',
        unit_rate: '',
        payment_condition: 'Payment processed upon approval of report',
      },
      {
        task_num: 3,
        description: 'Approved timesheets and signed invoices related to this assignment.',
        due_date: 'Within 2 days after completion of the assignment',
        quantitative_result: '1 signed timesheet and 1 approved invoice submitted within 2 days of assignment completion',
        qualitative_result: 'Timesheet and invoice accurately reflect days worked and are consistent with work order terms',
        means_of_verification: 'Approved invoice and countersigned timesheet',
        unit_rate: '',
        payment_condition: 'Payment processed upon approval of timesheet and invoice alongside all deliverables',
      },
    ],
  },
  bds_manual_module: {
    objective: `To develop two additional modules for the PRUDEV II BDS Manual — covering the Public Procurement and Disposal Authority (PPDA) and public procurement framework, and an updated URA tax compliance section incorporating 2026 legislative and regulatory changes — together with structured training content and materials for District Commercial Officers (DCOs) and Business Growth Experts (BGEs), and to co-facilitate the rollout training sessions for BGEs and DCOs across Gulu and Lira.`,
    key_tasks: `This is primarily a desk-based assignment, with field delivery limited to co-facilitation of BGE and DCO training sessions.

PHASE 1 — MODULE DEVELOPMENT (Desk Assignment)

1. Review the existing BDS Manual and identify the precise scope of additions required for the two new modules.
2. Draft Module 1 — PPDA & Public Procurement: covering PPDA's mandate and regulatory framework; public procurement principles, thresholds, and procedures; bid preparation and evaluation; contract award and management; grievance and appeals mechanisms; and practical guidance for MSMEs seeking to participate in public procurement.
3. Draft Module 2 — URA 2026 Update: incorporating all URA legislative and regulatory changes effective 2026; updated income tax rates and filing requirements; VAT thresholds and compliance; digital tax tools (e-Tax portal guidance); PAYE and withholding tax updates; and MSME-specific tax obligations.
4. Develop the DCO Training Package: facilitator guide, participant handbook, and session plans covering both new modules, tailored to the DCO's role in supporting business development practitioners and MSMEs.
5. Develop the BGE Training Content: practical materials equipping BGEs to support MSMEs on procurement participation, tax compliance, and business formalisation — written for a non-tax-specialist audience.
6. Submit drafts of both modules and all training materials for review by the BDS Expert and Team Leader; revise based on feedback.
7. Finalise and format both modules and training materials in line with the existing BDS Manual structure and PRUDEV II standards, ready for printing and distribution.

PHASE 2 — CO-FACILITATION OF TRAINING (5 days, 1st Week of September 2026)

8. Co-facilitate the BGE training sessions on the new BDS Manual modules, supporting practical exercises and ensuring BGEs can apply the new content in the field.
9. Co-facilitate the DCO training sessions in Gulu (Day 1) and Lira (Day 2), covering both new modules with practical exercises and case studies.
10. Collect participant feedback using the approved PRUDEV II feedback instrument at the close of each training day.
11. Prepare and submit a post-training report covering both BGE and DCO sessions, with participant engagement observations, feedback analysis, and recommendations for field application.`,
    deliverables_json: [
      {
        task_num: 1,
        description: 'Inception Note — outlining the content development plan, section structure, key sources to be referenced, and anticipated gaps in the existing BDS Manual',
        due_date: 'End of Week 1 (8 August 2026)',
        quantitative_result: '1 inception note submitted covering content plan and section structure',
        qualitative_result: 'Note is clear, complete, and provides a credible basis for the full content development phase',
        means_of_verification: 'Submitted inception note approved by BDS Expert',
        unit_rate: '',
        payment_condition: 'Required before content development proceeds — no separate payment',
      },
      {
        task_num: 2,
        description: 'PPDA Module — covering PPDA role, public procurement principles, thresholds, bid procedures, and compliance requirements for SMEs and business development practitioners',
        due_date: '22 August 2026',
        quantitative_result: '1 completed PPDA Module (minimum 10 pages) submitted by 22 August 2026',
        qualitative_result: 'Module is accurate, practically written, referenced to current PPDA guidelines, and appropriate for DCO and BGE audiences',
        means_of_verification: 'Submitted draft PPDA Module',
        unit_rate: '',
        payment_condition: 'Included in Phase 1 payment upon approval of all Phase 1 deliverables',
      },
      {
        task_num: 3,
        description: 'Public Procurement Section — step-by-step guide covering solicitation, bid preparation, evaluation criteria, contract award, and grievance mechanisms for MSMEs',
        due_date: '22 August 2026',
        quantitative_result: '1 completed Public Procurement Section (minimum 8 pages) submitted by 22 August 2026',
        qualitative_result: 'Section is practical, well-structured, and enables MSMEs and BGEs to navigate public procurement processes with confidence',
        means_of_verification: 'Submitted draft Public Procurement Section',
        unit_rate: '',
        payment_condition: 'Included in Phase 1 payment upon approval of all Phase 1 deliverables',
      },
      {
        task_num: 4,
        description: 'Updated URA Section — incorporating all relevant 2026 legislative and regulatory changes, including updated tax rates, e-Tax portal guidance, VAT thresholds, and MSME-specific obligations',
        due_date: '22 August 2026',
        quantitative_result: '1 updated URA Section (minimum 8 pages) submitted by 22 August 2026',
        qualitative_result: 'Section accurately reflects 2026 URA changes; all figures, rates, and procedures are current and referenced; content is accessible to non-tax specialists',
        means_of_verification: 'Submitted updated URA Section with source references',
        unit_rate: '',
        payment_condition: 'Included in Phase 1 payment upon approval of all Phase 1 deliverables',
      },
      {
        task_num: 5,
        description: 'DCO Training Package — facilitator guide, participant handbook, and session plans for a 2-day training on the new BDS Manual modules',
        due_date: '29 August 2026',
        quantitative_result: '1 complete DCO Training Package (facilitator guide + participant handbook + session plans) submitted by 29 August 2026',
        qualitative_result: 'Package enables any competent facilitator to deliver the 2-day training; materials are well-structured, practical, and calibrated to the DCO audience',
        means_of_verification: 'Submitted DCO Training Package approved by BDS Expert',
        unit_rate: '',
        payment_condition: 'Included in Phase 1 payment upon approval of all Phase 1 deliverables',
      },
      {
        task_num: 6,
        description: 'BGE Training Content — practical training materials to equip BGEs with applied knowledge of procurement participation, tax compliance, and business formalisation support',
        due_date: '29 August 2026',
        quantitative_result: '1 set of BGE training materials submitted by 29 August 2026',
        qualitative_result: 'Materials are practical, written for a non-specialist audience, and directly linked to BGE field support roles',
        means_of_verification: 'Submitted BGE Training Content approved by BDS Expert',
        unit_rate: '',
        payment_condition: 'Included in Phase 1 payment upon approval of all Phase 1 deliverables',
      },
      {
        task_num: 7,
        description: 'Finalised BDS Manual Additional Module — all four sections (PPDA, Public Procurement, URA Update, Training Content) consolidated, formatted, and approved for printing',
        due_date: '5 September 2026',
        quantitative_result: '1 finalised, formatted Additional Module document ready for printing and distribution',
        qualitative_result: 'Module is internally consistent, formatted to BDS Manual standards, reviewed and approved by BDS Expert and Team Leader',
        means_of_verification: 'Final approved copy of the Additional Module (PDF and Word versions)',
        unit_rate: '',
        payment_condition: 'Phase 1 payment processed upon approval of the finalised module',
      },
      {
        task_num: 8,
        description: 'DCO Training — Gulu (Day 1, 1st week of September 2026): 2-day DCO training delivered, Day 1 in Gulu',
        due_date: '1st Week of September 2026',
        quantitative_result: '1 day of DCO training delivered in Gulu; signed attendance register submitted',
        qualitative_result: 'Training is well-facilitated; DCOs engage with new content through practical exercises; facilitator is confident and content is delivered to standard',
        means_of_verification: 'Signed Gulu attendance register and participant feedback forms',
        unit_rate: '',
        payment_condition: 'Required for Phase 2 payment — attendance register must be submitted',
      },
      {
        task_num: 9,
        description: 'DCO Training — Lira (Day 2, 1st week of September 2026): 2-day DCO training delivered, Day 2 in Lira',
        due_date: '1st Week of September 2026',
        quantitative_result: '1 day of DCO training delivered in Lira; signed attendance register submitted',
        qualitative_result: 'Training is well-facilitated; DCOs engage with new content through practical exercises; consistent quality with Gulu session',
        means_of_verification: 'Signed Lira attendance register and participant feedback forms',
        unit_rate: '',
        payment_condition: 'Required for Phase 2 payment — attendance register must be submitted',
      },
      {
        task_num: 10,
        description: 'Post-Training Report — covering DCO training in Gulu and Lira, participant engagement, feedback analysis, and recommendations for BGE rollout',
        due_date: 'Within 5 days of final training day',
        quantitative_result: '1 post-training report submitted within 5 days of the Lira training day',
        qualitative_result: 'Report documents training content delivered, DCO engagement and feedback, key observations, and specific recommendations for BGE rollout',
        means_of_verification: 'Submitted post-training report approved by Team Leader',
        unit_rate: '',
        payment_condition: 'Phase 2 payment processed upon approval of the post-training report',
      },
      {
        task_num: 11,
        description: 'Approved invoice and signed timesheet',
        due_date: 'With post-training report',
        quantitative_result: '1 approved invoice and 1 signed timesheet reflecting 40 days worked',
        qualitative_result: 'Invoice and timesheet are accurate, consistent with work order terms, and submitted alongside the post-training report',
        means_of_verification: 'Approved invoice and countersigned timesheet',
        unit_rate: '',
        payment_condition: 'Final payment processed upon approval of invoice, timesheet, and post-training report',
      },
    ],
  },
  other: { objective: '', key_tasks: '', deliverables_json: [] },
};

const WO_EMPTY = {
  bge: '',
  group: '',
  work_order_type: 'msme_support',
  project_name: 'Promoting Rural Development II (PRUDEV II)',
  issue_date: new Date().toISOString().slice(0, 10),
  start_date: '',
  end_date: '',
  location: 'Northern Uganda (Gulu & Lira)',
  duration: '2 months',
  ...WO_DEFAULTS.msme_support,
  rate_per_day: 60000,
  max_days: 4,
  transport_reimbursed: true,
  payment_notes: '',
  team_leader_name: 'Stephen Maxi Opwonya',
  team_leader_position: 'Team Leader',
  participant_bges: [],
};

const WorkOrderDialog = React.memo(function WorkOrderDialog({ open, onClose, woEditing, experts, headers, onSaved, fetchWorkOrders }) {
  const [woForm, setWoForm] = React.useState({});
  const [woErrors, setWoErrors] = React.useState('');
  const [woSaving, setWoSaving] = React.useState(false);
  const [woConflict, setWoConflict] = React.useState(null);
  const [woAllowOverlap, setWoAllowOverlap] = React.useState(false);

  // Reset conflict when dialog closes
  React.useEffect(() => { if (!open) { setWoConflict(null); setWoAllowOverlap(false); } }, [open]);

  // Live overlap check whenever BGE or dates change
  React.useEffect(() => {
    const { bge, start_date, end_date } = woForm;
    if (!bge || !start_date || !end_date) { setWoConflict(null); return; }
    let cancelled = false;
    axios.get(API_ENDPOINTS.WORK_ORDERS, {
      headers,
      params: { bge },
    }).then(res => {
      if (cancelled) return;
      const orders = res.data?.results ?? res.data ?? [];
      const conflict = orders.find(wo => {
        if (!wo.start_date || !wo.end_date) return false;
        if (woEditing && wo.id === woEditing.id) return false;
        return wo.start_date <= end_date && wo.end_date >= start_date;
      });
      setWoConflict(conflict || null);
      if (!conflict) setWoAllowOverlap(false);
    }).catch(() => setWoConflict(null));
    return () => { cancelled = true; };
  }, [woForm.bge, woForm.start_date, woForm.end_date, woEditing, headers]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!open) return;
    if (woEditing) {
      setWoForm({
        bge: woEditing.bge,
        group: woEditing.group || '',
        work_order_type: woEditing.work_order_type,
        project_name: woEditing.project_name,
        issue_date: woEditing.issue_date,
        start_date: woEditing.start_date || '',
        end_date: woEditing.end_date || '',
        location: woEditing.location,
        duration: woEditing.duration,
        objective: woEditing.objective,
        key_tasks: woEditing.key_tasks,
        deliverables_json: woEditing.deliverables_json || [],
        rate_per_day: woEditing.rate_per_day,
        max_days: woEditing.max_days,
        transport_reimbursed: woEditing.transport_reimbursed,
        payment_notes: woEditing.payment_notes || '',
        team_leader_name: woEditing.team_leader_name,
        team_leader_position: woEditing.team_leader_position,
        participant_bges: woEditing.participant_bges || [],
      });
    } else {
      setWoForm({ ...WO_EMPTY });
    }
    setWoErrors('');
  }, [open, woEditing]);

  const applyWoDefaults = React.useCallback((type) => {
    const d = WO_DEFAULTS[type] || WO_DEFAULTS.other;
    const extra = {};
    if (type === 'msme_access_finance') {
      extra.start_date = '2026-06-03';
      extra.end_date   = '2026-06-16';
      extra.duration   = '7 working days';
      extra.max_days   = 7;
      extra.location   = 'Acholi Sub-region, Northern Uganda';
    }
    if (type === 'access_to_finance_bge') {
      extra.start_date   = '2026-08-12';
      extra.end_date     = '2026-08-25';
      extra.duration     = '10 working days (12–25 August 2026)';
      extra.max_days     = 10;
      extra.location     = 'Gulu & Adjumani, Northern Uganda';
      extra.transport_reimbursed = true;
      extra.rate_per_day = 60000;
      extra.team_leader_name     = 'Stephen Maxi Opwonya';
      extra.team_leader_position = 'Team Leader';
    }
    if (type === 'bcp_tool_training') {
      extra.duration     = '2 days';
      extra.max_days     = 2;
      extra.location     = 'Northern Uganda';
      extra.project_name = 'Promoting Rural Development II (PRUDEV II)';
      extra.rate_per_day = 60000;
      extra.team_leader_name     = 'Stephen Maxi Opwonya';
      extra.team_leader_position = 'Team Leader';
    }
    if (type === 'bge_bcp_participant_mentor') {
      extra.duration     = '6 days';
      extra.max_days     = 6;
      extra.start_date   = '2026-07-16';
      extra.end_date     = '2026-07-24';
      extra.location     = 'Gulu & Lira, Northern Uganda';
      extra.project_name = 'Promoting Rural Development II (PRUDEV II)';
      extra.rate_per_day = 60000;
      extra.team_leader_name     = 'Stephen Maxi Opwonya';
      extra.team_leader_position = 'Team Leader';
    }
    if (type === 'agro_biz_continuity') {
      extra.duration     = '02 days';
      extra.max_days     = 3;
      extra.start_date   = '2026-07-21';
      extra.end_date     = '2026-07-22';
      extra.location     = 'Northern Uganda';
      extra.project_name = 'PRUDEV II- Climate Smart Agro-processing for Green Jobs';
      extra.rate_per_day = 60000;
      extra.team_leader_name     = 'Stephen Maxi Opwonya';
      extra.team_leader_position = 'Team Leader';
    }
    if (type === 'bcp_senior_facilitator') {
      extra.duration     = '11 days (5 preparation + 2 BGE training + 4 MSME facilitation)';
      extra.max_days     = 11;
      extra.start_date   = '2026-07-08';
      extra.end_date     = '2026-07-24';
      extra.location     = 'Gulu & Lira, Northern Uganda';
      extra.project_name = 'PRUDEV II — Business Continuity & Strategic Planning';
      extra.rate_per_day = 80000;
      extra.team_leader_name     = 'Stephen Maxi Opwonya';
      extra.team_leader_position = 'Team Leader';
    }
    if (type === 'fi_mobilisation_bcp') {
      extra.duration     = 'Maximum of 4 days per MSME';
      extra.max_days     = 4;
      extra.rate_per_day = 60000;
      extra.project_name = 'Promoting Rural Development II (PRUDEV II)';
      extra.team_leader_name     = 'Stephen Maxi Opwonya';
      extra.team_leader_position = 'Team Leader';
    }
    if (type === 'carbon_emissions_training') {
      extra.duration     = 'Maximum of 5 days';
      extra.max_days     = 5;
      extra.rate_per_day = 60000;
      extra.project_name = 'Promoting Rural Development II (PRUDEV II)';
      extra.team_leader_name     = 'Stephen Maxi Opwonya';
      extra.team_leader_position = 'Team Leader';
    }
    if (type === 'csa_rapid_assessment') {
      extra.duration     = 'Maximum of 5 days per MSME';
      extra.max_days     = 5;
      extra.rate_per_day = 60000;
      extra.location     = 'Northern Uganda (Gulu, Kitgum, Adjumani & Lira)';
      extra.project_name = 'Promoting Rural Development II (PRUDEV II)';
      extra.team_leader_name     = 'Stephen Maxi Opwonya';
      extra.team_leader_position = 'Team Leader';
      extra.start_date   = '2026-08-10';
      extra.end_date     = '2026-08-21';
    }
    setWoForm(f => ({ ...f, work_order_type: type, objective: d.objective, key_tasks: d.key_tasks, deliverables_json: d.deliverables_json, ...extra }));
  }, []);

  const saveWo = React.useCallback(async () => {
    if (!woForm.bge) { setWoErrors('BGE is required.'); return; }
    if (!woForm.issue_date) { setWoErrors('Issue date is required.'); return; }
    setWoSaving(true); setWoErrors('');
    try {
      const payload = { ...woForm, group: woForm.group || null, allow_overlap: woAllowOverlap || false };
      if (woEditing) {
        await axios.put(`${API_ENDPOINTS.WORK_ORDERS}${woEditing.id}/`, payload, { headers });
      } else {
        await axios.post(API_ENDPOINTS.WORK_ORDERS, payload, { headers });
      }
      const msg = woEditing ? 'Work order updated.' : 'Work order created.';
      fetchWorkOrders();
      onSaved(msg);
    } catch (err) {
      setWoErrors(err.response?.data?.detail || JSON.stringify(err.response?.data || {}) || 'Save failed.');
    } finally {
      setWoSaving(false);
    }
  }, [woForm, woEditing, woAllowOverlap, headers, fetchWorkOrders, onSaved]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          width: { xs: 'calc(100vw - 16px)', md: '100%' },
          height: { xs: '96dvh', md: '90vh' },
          maxHeight: '96dvh',
          m: { xs: 1, md: 4 },
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
      }}
    >
      <DialogTitle fontWeight={700} sx={{ flexShrink: 0 }}>
        {woEditing ? 'Edit Work Order' : 'New Work Order'}
      </DialogTitle>
      <DialogContent
        dividers
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          px: { xs: 2, sm: 3 },
        }}
      >
        {woErrors && <Alert severity="error" sx={{ mb: 2 }}>{woErrors}</Alert>}
        {woConflict && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <strong>Date overlap detected.</strong> This BGE is already assigned work order{' '}
            <strong>{woConflict.work_order_number}</strong> from{' '}
            <strong>{woConflict.start_date}</strong> to <strong>{woConflict.end_date}</strong>.
            <Box sx={{ mt: 1 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={woAllowOverlap}
                    onChange={e => setWoAllowOverlap(e.target.checked)}
                  />
                }
                label={<Typography variant="caption" fontWeight={600}>Allow overlap — I confirm this BGE can handle both assignments simultaneously</Typography>}
              />
            </Box>
          </Alert>
        )}
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small" required>
              <InputLabel>BGE</InputLabel>
              <Select value={woForm.bge} label="BGE" onChange={e => setWoForm(f => ({ ...f, bge: e.target.value }))}>
                {woForm.work_order_type === 'bcp_senior_facilitator' ? (
                  experts.filter(e => e.is_senior).length > 0
                    ? experts.filter(e => e.is_senior).map(e =>
                        <MenuItem key={e.id} value={e.id}>{e.name} ({e.bge_code})</MenuItem>)
                    : <MenuItem disabled value="">No Senior BGEs found</MenuItem>
                ) : (
                  experts.map(e => <MenuItem key={e.id} value={e.id}>{e.name} ({e.bge_code})</MenuItem>)
                )}
              </Select>
            </FormControl>
            {woForm.work_order_type === 'bcp_senior_facilitator' && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Only Senior BGEs are listed for this work order type.
              </Typography>
            )}
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small">
              <InputLabel>Work Order Type</InputLabel>
              <Select value={woForm.work_order_type} label="Work Order Type"
                onChange={e => applyWoDefaults(e.target.value)}>
                <MenuItem value="msme_support">MSME CRM &amp; Business Support</MenuItem>
                <MenuItem value="msme_data_update">MSME Data Update &amp; Verification</MenuItem>
                <MenuItem value="msme_finance_survey">MSME Finance Survey (Google Forms)</MenuItem>
                <MenuItem value="msme_access_finance">Access to Finance &amp; Digital Onboarding</MenuItem>
                <MenuItem value="access_to_finance_bge">Access to Finance — BGE Template</MenuItem>
                <MenuItem value="agro_biz_continuity">Agro-processors — Business Continuity &amp; Strategic Planning</MenuItem>
                <MenuItem value="bcp_senior_facilitator">Agro-processors BCP — Senior BGE Lead Facilitator</MenuItem>
                <MenuItem value="mobilisation">Mobilisation / Outreach</MenuItem>
                <MenuItem value="group_session">Peer-to-Peer Group Session</MenuItem>
                <MenuItem value="bcp_tool_training">BCP Tool Training — BGE Participant</MenuItem>
                <MenuItem value="bge_bcp_participant_mentor">Agro-processors — Business Continuity &amp; Strategic Planning (BGE Support)</MenuItem>
                <MenuItem value="bcp_senior_facilitator">Agro-processors BCP — Senior BGE Lead Facilitator</MenuItem>
                <MenuItem value="outcome_assessment_tool">Outcome Assessment Tool Delivery</MenuItem>
                <MenuItem value="fi_mobilisation_bcp">BCP Tool - Field Implementation</MenuItem>
                <MenuItem value="carbon_emissions_training">Carbon Emissions Measurement Framework — Training &amp; Field Implementation</MenuItem>
                <MenuItem value="csa_rapid_assessment">CSA Rapid Assessment — Resilience Activity</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth size="small" label="Issue Date" type="date" InputLabelProps={{ shrink: true }}
              value={woForm.issue_date} onChange={e => setWoForm(f => ({ ...f, issue_date: e.target.value }))} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth size="small" label="Start Date" type="date" InputLabelProps={{ shrink: true }}
              value={woForm.start_date} onChange={e => setWoForm(f => ({ ...f, start_date: e.target.value }))} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth size="small" label="End Date" type="date" InputLabelProps={{ shrink: true }}
              value={woForm.end_date} onChange={e => setWoForm(f => ({ ...f, end_date: e.target.value }))} />
          </Grid>
          <Grid item xs={12} sm={8}>
            <TextField fullWidth size="small" label="Location"
              value={woForm.location} onChange={e => setWoForm(f => ({ ...f, location: e.target.value }))} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth size="small" label="Duration"
              value={woForm.duration} onChange={e => setWoForm(f => ({ ...f, duration: e.target.value }))} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth multiline minRows={3} size="small" label="Objective"
              value={woForm.objective} onChange={e => setWoForm(f => ({ ...f, objective: e.target.value }))} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth multiline minRows={5} size="small" label="Key Tasks (one per line)"
              helperText="Each numbered task on its own line — pre-populated by type, fully editable."
              value={woForm.key_tasks} onChange={e => setWoForm(f => ({ ...f, key_tasks: e.target.value }))} />
          </Grid>


          {/* ── SECTION: Deliverables ── */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={700}>Deliverables</Typography>
              <Button size="small" startIcon={<Add />} onClick={() => setWoForm(f => ({
                ...f,
                deliverables_json: [...f.deliverables_json, {
                  task_num: f.deliverables_json.length + 1,
                  description: '',
                  due_date: '',
                  quantitative_result: '',
                  qualitative_result: '',
                  means_of_verification: '',
                  unit_rate: '',
                  payment_condition: '',
                }],
              }))}>Add row</Button>
            </Box>
            {(woForm.deliverables_json || []).map((d, i) => (
              <Box key={i} sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '24px 1fr 40px', sm: '28px minmax(0, 1fr) minmax(150px, 200px) 40px' },
                gap: 1,
                mb: 1,
                alignItems: 'flex-start',
              }}>
                <Typography variant="caption" sx={{ pt: 1.2, fontWeight: 700 }}>{d.task_num}.</Typography>
                <TextField size="small" fullWidth multiline minRows={1} label="Deliverable / Task"
                  value={d.description}
                  onChange={e => {
                    const upd = [...woForm.deliverables_json];
                    upd[i] = { ...d, description: e.target.value };
                    setWoForm(f => ({ ...f, deliverables_json: upd }));
                  }} />
                <TextField size="small" fullWidth label="Due date"
                  sx={{ gridColumn: { xs: '2 / 3', sm: 'auto' } }}
                  value={d.due_date}
                  onChange={e => {
                    const upd = [...woForm.deliverables_json];
                    upd[i] = { ...d, due_date: e.target.value };
                    setWoForm(f => ({ ...f, deliverables_json: upd }));
                  }} />
                <IconButton size="small" color="error" sx={{ mt: 0.5, gridColumn: { xs: '3 / 4', sm: 'auto' } }} onClick={() => {
                  const upd = woForm.deliverables_json.filter((_, j) => j !== i)
                    .map((x, j) => ({ ...x, task_num: j + 1 }));
                  setWoForm(f => ({ ...f, deliverables_json: upd }));
                }}>
                  <Delete fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Grid>

          {/* ── SECTION: Results-Based Outcomes ── */}
          <Grid item xs={12}>
            <Box sx={{ borderTop: '2px solid', borderColor: 'primary.main', pt: 1.5, mt: 0.5 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
                Results-Based Outcomes
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                A BGE must achieve BOTH: Quantitative Targets = 50% AND Qualitative Outcomes = 50% to qualify for payment.
              </Typography>
              {(woForm.deliverables_json || []).map((d, i) => {
                const updField = (field, val) => {
                  const upd = [...woForm.deliverables_json];
                  upd[i] = { ...d, [field]: val };
                  setWoForm(f => ({ ...f, deliverables_json: upd }));
                };
                return (
                  <Box key={i} sx={{
                    mb: 2,
                    p: 1.5,
                    borderRadius: 1,
                    bgcolor: i % 2 === 0 ? 'grey.50' : 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}>
                    <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      Task {d.task_num}{d.description ? ` — ${d.description}` : ''}
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                      <TextField size="small" fullWidth multiline minRows={2} label="Quantitative Result Required"
                        value={d.quantitative_result || ''}
                        onChange={e => updField('quantitative_result', e.target.value)} />
                      <TextField size="small" fullWidth multiline minRows={2} label="Qualitative Result Required"
                        value={d.qualitative_result || ''}
                        onChange={e => updField('qualitative_result', e.target.value)} />
                      <TextField size="small" fullWidth multiline minRows={1} label="Means of Verification"
                        value={d.means_of_verification || ''}
                        onChange={e => updField('means_of_verification', e.target.value)} />
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                        <TextField size="small" fullWidth label="Unit Rate (UGX)"
                          value={d.unit_rate || ''}
                          onChange={e => updField('unit_rate', e.target.value)} />
                        <TextField size="small" fullWidth multiline minRows={1} label="Payment Condition"
                          value={d.payment_condition || ''}
                          onChange={e => updField('payment_condition', e.target.value)} />
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField fullWidth size="small" label="Rate / day (UGX)" type="number"
              value={woForm.rate_per_day} onChange={e => setWoForm(f => ({ ...f, rate_per_day: Number(e.target.value) }))} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth size="small" label="Maximum days" type="number"
              value={woForm.max_days} onChange={e => setWoForm(f => ({ ...f, max_days: Number(e.target.value) }))} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth size="small" label="Team Leader Name"
              value={woForm.team_leader_name} onChange={e => setWoForm(f => ({ ...f, team_leader_name: e.target.value }))} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth size="small" label="Payment notes (optional)"
              value={woForm.payment_notes} onChange={e => setWoForm(f => ({ ...f, payment_notes: e.target.value }))} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{
        flexShrink: 0,
        px: { xs: 2, sm: 3 },
        py: 1.5,
        gap: 1,
        flexWrap: 'wrap',
      }}>
        <Button onClick={onClose} sx={{ order: { xs: 2, sm: 0 } }}>Cancel</Button>
        <Button variant="contained" onClick={saveWo} disabled={woSaving}>
          {woSaving ? <CircularProgress size={18} /> : (woEditing ? 'Save Changes' : 'Create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

export default WorkOrderDialog;
