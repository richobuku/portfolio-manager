import React from 'react';
import {
  Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer';
const getLogoUrl = (name) => `${window.location.origin}/${name}`;

// Brand colours — dark slate for header so both GIZ and GOPA logos are legible without white boxes
const NAVY = '#1A2E42';
const GREEN = '#009B62';
const LIGHT_GREY = '#F4F6F9';
const MID_GREY = '#6B7280';
const DARK = '#111827';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: DARK,
    backgroundColor: '#FFFFFF',
    paddingBottom: 60,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: NAVY,
    paddingHorizontal: 36,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logoBox: {
    padding: 0,
  },
  logoImgGiz: {
    height: 34,
    width: 60,   // 718/405 ≈ 1.77 → 34*1.77 ≈ 60
  },
  logoImgGopa: {
    height: 22,
    width: 68,   // 993/324 ≈ 3.07 → 22*3.07 ≈ 68
  },
  dividerLine: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 10,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  programmeTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
  },
  programmeSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9,
    marginTop: 2,
  },

  // ── Accent bar ───────────────────────────────────────────────────────────────
  accentBar: {
    backgroundColor: GREEN,
    height: 4,
  },

  // ── Report title block ───────────────────────────────────────────────────────
  titleBlock: {
    paddingHorizontal: 36,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  reportType: {
    fontSize: 9,
    color: GREEN,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  reportTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 24,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'column',
  },
  metaLabel: {
    fontSize: 8,
    color: MID_GREY,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: DARK,
  },

  // ── Status badge ─────────────────────────────────────────────────────────────
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // ── Body ─────────────────────────────────────────────────────────────────────
  body: {
    paddingHorizontal: 36,
    paddingTop: 18,
  },

  // ── Section ──────────────────────────────────────────────────────────────────
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  sectionNumber: {
    backgroundColor: NAVY,
    color: '#FFFFFF',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    width: 18,
    height: 18,
    borderRadius: 9,
    textAlign: 'center',
    lineHeight: 18,
    paddingTop: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    flex: 1,
    borderBottomWidth: 1.5,
    borderBottomColor: GREEN,
    paddingBottom: 3,
  },
  sectionContent: {
    backgroundColor: LIGHT_GREY,
    borderRadius: 4,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: GREEN,
  },
  sectionText: {
    fontSize: 10,
    lineHeight: 1.6,
    color: DARK,
  },
  emptyContent: {
    fontSize: 9,
    color: MID_GREY,
    fontStyle: 'italic',
  },

  // ── MSME info box ────────────────────────────────────────────────────────────
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    backgroundColor: LIGHT_GREY,
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
  },
  infoCell: {
    width: '46%',
  },
  infoCellLabel: {
    fontSize: 8,
    color: MID_GREY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoCellValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: DARK,
  },

  // ── Footer ───────────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 36,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  footerLeft: {
    fontSize: 8,
    color: MID_GREY,
  },
  footerRight: {
    fontSize: 8,
    color: MID_GREY,
  },
  footerBrand: {
    fontSize: 8,
    color: NAVY,
    fontFamily: 'Helvetica-Bold',
  },

  // ── Signature block ───────────────────────────────────────────────────────────
  signatureSection: {
    flexDirection: 'row',
    gap: 36,
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  signatureBox: {
    flex: 1,
    alignItems: 'center',
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: DARK,
    width: '80%',
    marginBottom: 4,
    marginTop: 36,
  },
  signatureLabel: {
    fontSize: 8,
    color: MID_GREY,
    textAlign: 'center',
  },
});

const VISIT_TYPE_LABELS = {
  initial: 'Initial Assessment',
  followup: 'Follow-up Visit',
  final: 'Final Assessment',
  training: 'Training Support',
  mentoring: 'Mentoring Session',
};

const STATUS_STYLES = {
  draft:     { bg: '#F3F4F6', text: MID_GREY },
  submitted: { bg: '#DBEAFE', text: '#1D4ED8' },
  reviewed:  { bg: '#D1FAE5', text: '#065F46' },
};

const SECTION_FIELDS = [
  { key: 'business_overview',     label: 'Business Overview' },
  { key: 'challenges_identified', label: 'Challenges Identified' },
  { key: 'support_provided',      label: 'Support Provided' },
  { key: 'recommendations',       label: 'Recommendations' },
  { key: 'action_plan',           label: 'Action Plan' },
  { key: 'next_steps',            label: 'Next Steps' },
  { key: 'additional_notes',      label: 'Additional Notes' },
];

export default function ReportPDF({ report, msme, bgeName }) {
  const visitLabel = VISIT_TYPE_LABELS[report.visit_type] || report.visit_type;
  const statusStyle = STATUS_STYLES[report.status] || STATUS_STYLES.draft;
  const msmeName = msme?.business_name || msme?.name || report.msme_name || 'MSME';
  const msmeCode = msme?.msme_code || msme?.code || report.msme_code || '';
  const generatedDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <Document
      title={`${visitLabel} Report — ${msmeName}`}
      author={bgeName || 'PRUDEV II Programme'}
      subject="MSME Visit Report"
      creator="PRUDEV II Portfolio Management System"
    >
      <Page size="A4" style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logoBox}>
              <Image src={getLogoUrl('giz-logo.png')} style={styles.logoImgGiz} />
            </View>
            <View style={styles.dividerLine} />
            <View style={styles.logoBox}>
              <Image src={getLogoUrl('gopa-logo.png')} style={styles.logoImgGopa} />
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.programmeTitle}>PRUDEV II Programme</Text>
            <Text style={styles.programmeSubtitle}>MSME Portfolio Management System</Text>
          </View>
        </View>

        {/* ── Green accent bar ── */}
        <View style={styles.accentBar} />

        {/* ── Report title block ── */}
        <View style={styles.titleBlock}>
          <Text style={styles.reportType}>Visit Report</Text>
          <Text style={styles.reportTitle}>{visitLabel}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Visit Date</Text>
              <Text style={styles.metaValue}>{report.visit_date}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>BGE Expert</Text>
              <Text style={styles.metaValue}>{bgeName || '—'}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Report Status</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.statusText, { color: statusStyle.text }]}>
                  {report.status}
                </Text>
              </View>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Generated</Text>
              <Text style={styles.metaValue}>{generatedDate}</Text>
            </View>
          </View>
        </View>

        {/* ── Body ── */}
        <View style={styles.body}>
          {/* MSME info box */}
          <View style={styles.infoGrid}>
            <View style={styles.infoCell}>
              <Text style={styles.infoCellLabel}>Business Name</Text>
              <Text style={styles.infoCellValue}>{msmeName}</Text>
            </View>
            {msmeCode ? (
              <View style={styles.infoCell}>
                <Text style={styles.infoCellLabel}>MSME Code</Text>
                <Text style={styles.infoCellValue}>{msmeCode}</Text>
              </View>
            ) : null}
            {(msme?.sector) ? (
              <View style={styles.infoCell}>
                <Text style={styles.infoCellLabel}>Sector</Text>
                <Text style={styles.infoCellValue}>{msme.sector}</Text>
              </View>
            ) : null}
            {(msme?.city || msme?.location) ? (
              <View style={styles.infoCell}>
                <Text style={styles.infoCellLabel}>Location</Text>
                <Text style={styles.infoCellValue}>{msme?.city || msme?.location}</Text>
              </View>
            ) : null}
            {(msme?.cohort_name) ? (
              <View style={styles.infoCell}>
                <Text style={styles.infoCellLabel}>Cohort</Text>
                <Text style={styles.infoCellValue}>{msme.cohort_name}</Text>
              </View>
            ) : null}
            {(msme?.msme_type || msme?.business_type) ? (
              <View style={styles.infoCell}>
                <Text style={styles.infoCellLabel}>Business Type</Text>
                <Text style={styles.infoCellValue}>{msme?.msme_type || msme?.business_type}</Text>
              </View>
            ) : null}
          </View>

          {/* Report sections */}
          {SECTION_FIELDS.map(({ key, label }, i) => (
            <View key={key} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionNumber}>{i + 1}</Text>
                <Text style={styles.sectionTitle}>{label}</Text>
              </View>
              <View style={styles.sectionContent}>
                {report[key] ? (
                  <Text style={styles.sectionText}>{report[key]}</Text>
                ) : (
                  <Text style={styles.emptyContent}>No information recorded.</Text>
                )}
              </View>
            </View>
          ))}

          {/* Signature block */}
          <View style={styles.signatureSection}>
            <View style={styles.signatureBox}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>BDS Expert Signature</Text>
              <Text style={[styles.signatureLabel, { fontFamily: 'Helvetica-Bold', marginTop: 2 }]}>
                {bgeName || '___________________'}
              </Text>
            </View>
            <View style={styles.signatureBox}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Programme Officer</Text>
              <Text style={[styles.signatureLabel, { fontFamily: 'Helvetica-Bold', marginTop: 2 }]}>
                {'___________________'}
              </Text>
            </View>
            <View style={styles.signatureBox}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Date</Text>
              <Text style={[styles.signatureLabel, { fontFamily: 'Helvetica-Bold', marginTop: 2 }]}>
                {report.visit_date}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerLeft}>
            PRUDEV II MSME Portfolio Management System
          </Text>
          <Text style={styles.footerBrand}>GIZ · GOPA AFC</Text>
          <Text style={styles.footerRight}>
            Confidential — Programme Use Only
          </Text>
        </View>
      </Page>
    </Document>
  );
}
