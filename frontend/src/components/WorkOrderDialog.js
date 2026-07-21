import React from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, FormControlLabel, Grid,
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
    objective: `To support Access to Finance BGEs in onboarding MSMEs to digital finance platforms, building bankability, and mapping credit needs for follow-up engagement with financial institutions. This template focuses on 15 MSMEs over 7 working days, with an emphasis on practical digital onboarding and credit readiness documentation.`,
    key_tasks: `1. Attend orientation on the Access to Finance assignment, digital finance platforms, and credit mapping requirements.
2. Receive the assigned list of 15 MSMEs and develop a field visit and onboarding plan.
3. Visit each MSME and support onboarding onto at least two digital finance platforms such as MOMO Pays, Flexy Pay, Wendi, or a business banking solution.
4. Document each MSME's digital finance onboarding progress, including registration evidence and platform access details.
5. Assess each MSME's interest in appropriate credit products and capture the preferred creditor and product type.
6. Prepare a Credit Interest Mapping Report that summarises MSME readiness, product interest, and follow-up recommendations.
7. Identify and document barriers to digital onboarding, including smartphone access, ID, or connectivity challenges.
8. Submit daily progress updates and complete the final Access to Finance field report, invoice, and timesheet.`,
    deliverables_json: [
      { task_num: 1, description: 'Orientation on digital finance onboarding and credit mapping completed', due_date: 'Day 1', quantitative_result: 'Orientation completed and documented for the assigned BGE', qualitative_result: 'BGE understands the digital finance onboarding and credit mapping process', means_of_verification: 'Signed orientation confirmation', unit_rate: '', payment_condition: 'Required prerequisite — no separate payment' },
      { task_num: 2, description: 'Detailed field visit and onboarding plan for 15 assigned MSMEs', due_date: 'Day 1', quantitative_result: 'Onboarding plan submitted covering all 15 MSMEs and the planned schedule', qualitative_result: 'Plan is clear, logistically sound, and ready for execution', means_of_verification: 'Submitted onboarding plan', unit_rate: '', payment_condition: 'Required before field visits begin' },
      { task_num: 3, description: 'Digital finance onboarding evidence for each MSME — minimum 2 platforms per MSME', due_date: 'Rolling across assignment', quantitative_result: 'At least 2 digital platforms onboarded for each MSME', qualitative_result: 'Onboarding evidence is complete, verified, and usable by the MSME', means_of_verification: 'Screenshots, confirmation messages, or account details per MSME', unit_rate: '', payment_condition: 'Pay only if onboarding evidence is complete and verified for at least 80% of MSMEs' },
      { task_num: 4, description: 'Credit Interest Mapping Report with MSME product preferences and readiness assessment', due_date: 'Day 6', quantitative_result: 'Credit Interest Mapping Report submitted covering all 15 MSMEs', qualitative_result: 'Report accurately reflects MSME product interest and readiness level', means_of_verification: 'Submitted and approved report', unit_rate: '', payment_condition: 'Pay only if report is submitted on time and approved' },
      { task_num: 5, description: 'Barrier Register capturing digital onboarding challenges per MSME', due_date: 'Day 6', quantitative_result: 'Barrier register submitted for MSMEs with onboarding challenges', qualitative_result: 'Register clearly documents issues and recommended follow-up actions', means_of_verification: 'Submitted barrier register', unit_rate: '', payment_condition: 'Required for payment — shows thorough field follow-up' },
      { task_num: 6, description: 'Final Access to Finance field report with recommendations and next steps', due_date: 'Day 7', quantitative_result: 'Field report submitted by Day 7', qualitative_result: 'Report provides clear recommendations, next steps, and evidence of the assignment outcome', means_of_verification: 'Submitted final report', unit_rate: '', payment_condition: 'Payment processed upon approval of final report' },
      { task_num: 7, description: 'Approved invoice and signed timesheet', due_date: 'Day 7', quantitative_result: 'Invoice and signed timesheet submitted by Day 7', qualitative_result: 'Invoice and timesheet accurately reflect the 7-day assignment', means_of_verification: 'Approved invoice and signed timesheet', unit_rate: '', payment_condition: 'Pay processed upon approval of all deliverables' },
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
  biz_continuity_workshop: {
    objective: `To design and facilitate a 3-day hands-on Business Continuity Planning Workshop for agro-processors under the PRUDEV II programme. The assignment involves 2 preparation days — developing a fit-for-purpose BCP Toolkit and pre-training assigned BGEs — followed by 3 days of structured workshop facilitation with agro-processors. During the workshop, participants will collaboratively map business risks, critical functions, dependencies, and recovery strategies, and will begin developing their individual MSME Business Continuity Plans. Assigned BGEs will subsequently follow up on-site to complete the remaining assessments and finalise the plans.`,
    key_tasks: `PREPARATION — Days 1 & 2

1. Develop the Business Continuity Planning Toolkit
• Design and produce all materials required for the workshop: session guides, risk mapping matrices, business function templates, dependency mapping tools, BCP framework document, and facilitator notes.
• Ensure all materials are practical, MSME-appropriate, and ready for use before the workshop begins.

2. Pre-train Assigned BGEs
• Facilitate a pre-training session with all BGEs assigned to the workshop.
• Walk BGEs through the BCP Toolkit, their facilitation roles during the 3-day workshop, and the on-site follow-up assignment that follows.
• Confirm BGE readiness before the workshop commences.

WORKSHOP FACILITATION — Days 3, 4 & 5

3. Workshop Day 1 — Risk Mapping and Business Process Documentation
• Introduce the Business Continuity Planning process and expected outputs to all agro-processor participants.
• Facilitate structured risk identification and business process mapping for each MSME using the toolkit templates.
• Capture outputs and ensure all participants complete their risk and process documentation before end of day.

4. Workshop Day 2 — Business Dependencies and Recovery Strategies
• Guide participants through identification of critical business dependencies (suppliers, buyers, services, utilities).
• Facilitate development of initial recovery strategies for each MSME's critical risks and functions.
• Capture outputs and ensure each participant has a clear draft recovery framework before end of day.

5. Workshop Day 3 — Individual BCP Drafting and Next Steps
• Support each MSME in drafting their individual Business Continuity Plan using all inputs gathered across Days 1 and 2.
• Review and refine each draft plan with the participant.
• Agree on next steps, assign BGEs for on-site follow-up, and confirm the follow-up schedule before close of workshop.

POST-WORKSHOP

6. Compile and submit the Workshop Report covering all 3 facilitation days.
7. Submit approved invoice and signed timesheet.`,
    deliverables_json: [
      {
        task_num: 1,
        description: 'Business Continuity Planning Toolkit developed — including session guides, risk mapping matrices, business function templates, dependency mapping tools, BCP framework document, and facilitator notes',
        due_date: 'End of Preparation Day 1',
        quantitative_result: '1 complete BCP Toolkit package delivered, covering all materials required to run the 3-day workshop',
        qualitative_result: 'The toolkit is practical, contextually appropriate for Ugandan agro-processors, and ready for use without further revision; reviewed and confirmed before the workshop begins',
        means_of_verification: 'Submitted BCP Toolkit package (soft copy and printed copies for facilitation)',
        unit_rate: '',
        payment_condition: 'Prerequisite for the workshop — no separate payment (included in preparation day fees)',
      },
      {
        task_num: 2,
        description: 'BGE pre-training completed — all assigned BGEs trained on the BCP Toolkit, their facilitation roles, and on-site follow-up responsibilities',
        due_date: 'End of Preparation Day 2',
        quantitative_result: '1 BGE pre-training session completed; all assigned BGEs attended and signed the attendance register',
        qualitative_result: 'BGEs understand the toolkit, can explain each step to MSMEs, and are confident in their assigned facilitation roles for the 3-day workshop',
        means_of_verification: 'Signed BGE pre-training attendance register and session notes',
        unit_rate: '',
        payment_condition: 'Required before workshop commences; payment included in preparation day fees',
      },
      {
        task_num: 3,
        description: 'Workshop Day 1 facilitated — risk identification and business process mapping completed with all agro-processor participants',
        due_date: 'Workshop Day 1',
        quantitative_result: '1 full workshop day facilitated; all enrolled agro-processors attended and completed their risk mapping and process documentation outputs',
        qualitative_result: 'Participants are engaged and have documented their key business risks and critical processes using the BCP Toolkit templates; outputs are sufficient to support Day 2 activities',
        means_of_verification: 'Signed Day 1 attendance register and completed risk mapping outputs per participant',
        unit_rate: '',
        payment_condition: 'Payment upon submission of Day 1 attendance register and participant risk mapping outputs',
      },
      {
        task_num: 4,
        description: 'Workshop Day 2 facilitated — business dependencies and recovery strategies developed with all agro-processor participants',
        due_date: 'Workshop Day 2',
        quantitative_result: '1 full workshop day facilitated; all enrolled agro-processors attended and completed their dependency mapping and initial recovery strategy outputs',
        qualitative_result: 'Participants have clearly identified their critical business dependencies and developed actionable recovery strategies; outputs build directly on Day 1 work and are ready for BCP drafting on Day 3',
        means_of_verification: 'Signed Day 2 attendance register and completed dependency mapping and recovery strategy outputs per participant',
        unit_rate: '',
        payment_condition: 'Payment upon submission of Day 2 attendance register and participant dependency and recovery outputs',
      },
      {
        task_num: 5,
        description: 'Workshop Day 3 facilitated — individual MSME Business Continuity Plan drafts completed and BGE follow-up schedule agreed',
        due_date: 'Workshop Day 3',
        quantitative_result: '1 full workshop day facilitated; all enrolled agro-processors have a written draft Business Continuity Plan and an agreed BGE follow-up schedule',
        qualitative_result: 'Each MSME BCP draft is realistic, specific to their business, and captures risks, critical functions, dependencies, and recovery strategies developed across all 3 workshop days; each participant understands their plan and next steps',
        means_of_verification: 'Signed Day 3 attendance register and individual MSME BCP draft per participant',
        unit_rate: '',
        payment_condition: 'Payment upon submission of Day 3 attendance register and all MSME BCP drafts',
      },
      {
        task_num: 6,
        description: 'Workshop Report submitted — covering all 3 facilitation days, participant engagement, key outputs per day, BGE follow-up assignments, and recommendations',
        due_date: 'Within 3 days of final workshop day',
        quantitative_result: '1 workshop report submitted within 3 days of the final workshop day',
        qualitative_result: 'Report clearly documents what was achieved across all 3 days, the quality of participant outputs, which BGEs are assigned to which MSMEs for follow-up, and specific recommendations to support plan finalisation',
        means_of_verification: 'Submitted and approved workshop report',
        unit_rate: '',
        payment_condition: 'Final payment processed upon approval of the workshop report',
      },
      {
        task_num: 7,
        description: 'Approved invoice and signed timesheet submitted',
        due_date: 'With workshop report',
        quantitative_result: '1 approved invoice and 1 signed timesheet reflecting 5 days worked (2 preparation + 3 facilitation)',
        qualitative_result: 'Invoice and timesheet are accurate, consistent with the work order terms, and submitted alongside the workshop report',
        means_of_verification: 'Approved invoice and countersigned timesheet',
        unit_rate: '',
        payment_condition: 'Payment processed upon approval of invoice, timesheet, and workshop report',
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
  training_facilitation: {
    objective: `To lead the design and facilitation of structured training for MSMEs and Business Growth Experts (BGEs) under the Prudev II programme. The Senior BGE will work alongside the BDS Expert to develop training content, deliver sessions, co-facilitate with the broader BGE team, monitor active participation, collect participant feedback, and share lessons learnt with the programme team.`,
    key_tasks: `1. Collaborate with the BDS Expert to design and develop training content, materials, and session plans in line with PRUDEV II programme standards.
2. Lead the delivery of assigned training modules for MSME cohorts and/or BGE capacity-building sessions.
3. Co-facilitate training sessions alongside the Lead Facilitator and guest trainers, ensuring structured and effective delivery.
4. Brief and prepare assigned BGEs before each session to ensure active, confident participation in facilitation.
5. Monitor BGE engagement during sessions and provide real-time coaching and support where needed.
6. Design and administer participant feedback forms at the end of each training session.
7. Consolidate and analyse participant feedback, identifying trends, strengths, and areas for improvement.
8. Conduct a structured post-training review with the delivery team within 3 days of each session.
9. Compile and share a detailed Training Report and Lessons Learnt document with the programme team after each training.
10. Maintain training records, attendance sheets, and all programme documentation in the required PRUDEV II formats.`,
    deliverables_json: [
      { task_num: 1, description: 'Training Content Package – session plans, facilitator guides, and participant materials approved by the BDS Expert', due_date: 'Before first training session', quantitative_result: 'Complete training content package approved by BDS Expert before the first training session', qualitative_result: 'Content is well-structured, contextually relevant, and meets PRUDEV II quality standards', means_of_verification: 'Approved training content package with sign-off from BDS Expert', unit_rate: '', payment_condition: 'Required before training commences — no separate payment' },
      { task_num: 2, description: 'Signed attendance sheets – collected and submitted for every session', due_date: 'Day of each session', quantitative_result: 'Signed attendance sheet collected and submitted for every training session on the day of delivery', qualitative_result: 'Sheets are complete, legible, and accurately capture participant attendance', means_of_verification: 'Original signed attendance sheets per session', unit_rate: '', payment_condition: 'Required for payment — must be submitted on the day of each session' },
      { task_num: 3, description: 'Participant Feedback Summary – consolidated analysis of feedback forms from each training', due_date: 'Within 3 days of each session', quantitative_result: 'Participant feedback summary submitted within 3 days of each training session', qualitative_result: 'Summary provides consolidated analysis of feedback, identifies key themes, and highlights areas for improvement', means_of_verification: 'Submitted feedback summary with original feedback forms attached', unit_rate: '', payment_condition: 'Pay only if submitted within required timeline' },
      { task_num: 4, description: 'Post-Training Review Notes – documented debrief with the facilitation team', due_date: 'Within 3 days of each session', quantitative_result: 'Post-training review notes submitted within 3 days of each session', qualitative_result: 'Notes reflect a structured debrief, capture team observations, and include agreed improvement actions', means_of_verification: 'Submitted post-training review notes', unit_rate: '', payment_condition: 'Pay only if submitted within required timeline' },
      { task_num: 5, description: 'Detailed Training Report – covering objectives, activities, key findings, observations, and recommendations', due_date: 'Within 5 days of each session', quantitative_result: 'Detailed training report submitted within 5 days of each training session', qualitative_result: 'Report covers objectives, activities, key findings, observations, and recommendations with sufficient depth', means_of_verification: 'Submitted detailed training report', unit_rate: '', payment_condition: 'Pay only if submitted within 5 days and approved by BDS Expert' },
      { task_num: 6, description: 'Lessons Learnt Report – structured document capturing insights for future training design and delivery', due_date: 'End of assignment', quantitative_result: '1 lessons learnt report submitted at the end of the assignment', qualitative_result: 'Report provides structured, insightful reflections that can genuinely improve future training design and delivery', means_of_verification: 'Submitted lessons learnt report', unit_rate: '', payment_condition: 'Pay only if submitted on time and approved' },
      { task_num: 7, description: 'Approved invoice and signed timesheet', due_date: 'Monthly, with report submission', quantitative_result: '1 invoice and 1 signed timesheet submitted monthly with the report', qualitative_result: 'Invoice and timesheet accurately reflect days worked and are consistent with work order terms', means_of_verification: 'Approved invoice and countersigned timesheet', unit_rate: '', payment_condition: 'Payment processed upon approval of monthly deliverables' },
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
  bcp_tool_facilitation: {
    objective: `To facilitate a capacity building training for Business Growth Experts (BGEs) on the Business Continuity Planning (BCP) tool, equipping them with the practical skills to apply the tool effectively when supporting MSMEs.`,
    key_tasks: `The Senior BGE will:
i. Orient participating BGEs on the Business Continuity Planning tool, its purpose, and its application in MSME support
ii. Facilitate hands-on practice sessions, guiding BGEs through each section of the BCP tool
iii. Guide BGEs in applying the tool to real MSME scenarios during training exercises
iv. Evaluate BGE understanding and competency in using the BCP tool through practical exercises
v. Collect participant feedback using the approved PRUDEV II feedback instrument
vi. Compile and submit a Training Report within 5 working days of the training`,
    deliverables_json: [
      { task_num: 1, description: 'BCP Tool training successfully facilitated for BGEs', due_date: 'Day of training', quantitative_result: 'Training delivered to all assigned BGEs', qualitative_result: 'Sessions are structured, practical, and meet PRUDEV II quality standards', means_of_verification: 'Signed attendance register and session notes', unit_rate: '', payment_condition: 'Required for payment' },
      { task_num: 2, description: 'Participant feedback collected and summarised', due_date: 'Within 3 days of training', quantitative_result: 'Feedback collected from all participants and summary submitted', qualitative_result: 'Summary identifies key themes and areas for improvement', means_of_verification: 'Submitted feedback summary with original forms', unit_rate: '', payment_condition: 'Pay only if submitted within required timeline' },
      { task_num: 3, description: 'Training Report submitted', due_date: 'Within 5 days of training', quantitative_result: '1 training report submitted covering objectives, activities, observations, and recommendations', qualitative_result: 'Report is comprehensive and meets PRUDEV II reporting standards', means_of_verification: 'Submitted training report approved by BDS Expert', unit_rate: '', payment_condition: 'Payment processed upon approval of training report' },
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
    objective: `To participate in the Business Continuity Plan (BCP) Tool Training (16–17 July 2026) and subsequently provide facilitation support to MSMEs during the Business Continuity Plan workshop sessions in Gulu (21–22 July 2026) and Lira (23–24 July 2026), assisting MSMEs in applying the BCP tool to their enterprises.`,
    key_tasks: `The BGE will:
i. Attend the two-day BCP Tool Training (16–17 July 2026) and demonstrate understanding of the BCP tool and its application to MSME support
ii. Provide facilitation support at the Business Continuity Plan MSME workshop in Gulu (21–22 July 2026), assisting participants with exercises and guiding them through the BCP tool
iii. Provide facilitation support at the Business Continuity Plan MSME workshop in Lira (23–24 July 2026), assisting participants with exercises and guiding them through the BCP tool
iv. Support MSMEs in completing risk assessment exercises and developing their Business Continuity Plans under the guidance of the lead facilitator
v. Submit a brief post-workshop summary report within 5 working days of the final session`,
    deliverables_json: [
      { task_num: 1, description: 'Full attendance at BCP Tool Training — Gulu', due_date: '16–17 July 2026', quantitative_result: 'BGE attends both days of the BCP Tool Training', qualitative_result: 'Active and engaged participation throughout', means_of_verification: 'Signed attendance register', unit_rate: '', payment_condition: 'Required for payment — non-attendance forfeits fee' },
      { task_num: 2, description: 'Facilitation support at MSME BCP Workshop — Gulu', due_date: '21–22 July 2026', quantitative_result: 'BGE provides facilitation support for both days in Gulu', qualitative_result: 'MSMEs guided effectively through BCP tool exercises', means_of_verification: 'Signed attendance register and lead facilitator confirmation', unit_rate: '', payment_condition: 'Required for payment' },
      { task_num: 3, description: 'Facilitation support at MSME BCP Workshop — Lira', due_date: '23–24 July 2026', quantitative_result: 'BGE provides facilitation support for both days in Lira', qualitative_result: 'MSMEs guided effectively through BCP tool exercises', means_of_verification: 'Signed attendance register and lead facilitator confirmation', unit_rate: '', payment_condition: 'Required for payment' },
      { task_num: 4, description: 'Post-workshop summary report', due_date: 'Within 5 working days of 24 July 2026', quantitative_result: '1 summary report submitted covering observations from training and both workshop locations', qualitative_result: 'Report captures key observations, MSME challenges, and recommended follow-up actions', means_of_verification: 'Submitted summary report', unit_rate: '', payment_condition: 'Payment processed upon submission and approval of report' },
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
    if (type === 'msme_access_finance' || type === 'access_to_finance_bge') {
      extra.start_date = '2026-06-03';
      extra.end_date   = '2026-06-16';
      extra.duration   = '7 working days';
      extra.max_days   = 7;
      extra.location   = 'Acholi Sub-region, Northern Uganda';
    }
    if (type === 'biz_continuity') {
      extra.duration     = '7 days';
      extra.max_days     = 7;
      extra.location     = 'Gulu / Lira, Northern Uganda';
      extra.team_leader_name     = 'Stephen Maxi Opwonya';
      extra.team_leader_position = 'Team Leader';
    }
    if (type === 'biz_continuity_workshop') {
      extra.duration     = '5 days (2 preparation + 3 facilitation)';
      extra.max_days     = 5;
      extra.location     = 'Gulu / Lira, Northern Uganda';
      extra.project_name = 'PRUDEV II — Business Continuity Planning Workshop';
      extra.team_leader_name     = 'Stephen Maxi Opwonya';
      extra.team_leader_position = 'Team Leader';
    }
    if (type === 'bcp_tool_facilitation') {
      extra.duration     = '2 days';
      extra.max_days     = 2;
      extra.location     = 'Northern Uganda';
      extra.project_name = 'Promoting Rural Development II (PRUDEV II)';
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
                {woForm.work_order_type === 'training_facilitation' ? (
                  experts.filter(e => e.is_senior).length > 0
                    ? experts.filter(e => e.is_senior).map(e =>
                        <MenuItem key={e.id} value={e.id}>{e.name} ({e.bge_code})</MenuItem>)
                    : <MenuItem disabled value="">No Senior BGEs found</MenuItem>
                ) : (
                  experts.map(e => <MenuItem key={e.id} value={e.id}>{e.name} ({e.bge_code})</MenuItem>)
                )}
              </Select>
            </FormControl>
            {woForm.work_order_type === 'training_facilitation' && (
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
                <MenuItem value="biz_continuity">Business Continuity &amp; Operational Planning</MenuItem>
                <MenuItem value="biz_continuity_workshop">Business Continuity — Workshop Design &amp; Facilitation</MenuItem>
                <MenuItem value="agro_biz_continuity">Agro-processors — Business Continuity &amp; Strategic Planning</MenuItem>
                <MenuItem value="mobilisation">Mobilisation / Outreach</MenuItem>
                <MenuItem value="group_session">Peer-to-Peer Group Session</MenuItem>
                <MenuItem value="training_facilitation">Training Facilitation — Senior BGE</MenuItem>
                <MenuItem value="bcp_tool_facilitation">BCP Tool Training — Senior BGE Facilitator</MenuItem>
                <MenuItem value="bcp_tool_training">BCP Tool Training — BGE Participant</MenuItem>
                <MenuItem value="bge_bcp_participant_mentor">BCP Training — BGE Participant &amp; MSME Support</MenuItem>
                <MenuItem value="outcome_assessment_tool">Outcome Assessment Tool Delivery</MenuItem>
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

          {/* ── SECTION: Training Programme (BCP Tool types only) ── */}
          {woForm.work_order_type === 'bcp_tool_facilitation' && (
            <>
              <Grid item xs={12}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>Training Programme</Typography>
                <Divider />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth size="small">
                  <InputLabel>BGE Participants (attending the training)</InputLabel>
                  <Select
                    multiple
                    value={woForm.participant_bges || []}
                    label="BGE Participants (attending the training)"
                    onChange={e => setWoForm(f => ({ ...f, participant_bges: e.target.value }))}
                    renderValue={selected => selected.map(id => {
                      const ex = experts.find(x => x.id === id);
                      return ex ? ex.name : id;
                    }).join(', ')}
                  >
                    {experts.map(ex => (
                      <MenuItem key={ex.id} value={ex.id}>
                        <input type="checkbox" readOnly
                          checked={(woForm.participant_bges || []).includes(ex.id)}
                          style={{ marginRight: 8 }} />
                        {ex.name} ({ex.bge_code})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  Select all BGEs attending as participants — their names appear in the Training Programme section of the PDF.
                </Typography>
              </Grid>
            </>
          )}

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
