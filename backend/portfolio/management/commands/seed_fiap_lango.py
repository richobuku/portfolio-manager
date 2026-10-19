"""
Management command: Seed the 84 Lira / Lango MSME Financial Improvement Action Plans (FIAP).
Sources from the official PRUDEV II / GOPA Pro Lira / Lango Access to Finance Action Plans.

Usage:
    python manage.py seed_fiap_lango
"""

import re
from datetime import date
from django.core.management.base import BaseCommand
from django.db.models import Q
from portfolio.models import MSME, FinancialImprovementActionPlan, BusinessGrowthExpert
from portfolio.fiap_constants import FIAP_CATEGORIES, STANDARD_GAPS

# 84 MSME Action Plan Records extracted from official PRUDEV II Lira/Lango dataset
FIAP_DATA = [
    # Category 1: Financial Records & Documentation Strengthening (21 MSMEs)
    {
        "num": 1, "name": "Agro Green Ventures Ltd", "sector": "Shea business", "cat": 1,
        "priority": "High", "location": "Otuke,Orum,Orum",
        "target": "Graduate from SACCO credit to a bank working-capital or asset loan",
        "fsp": "Centenary Bank", "source": "Lango support form only",
        "gaps": ["No financial records kept", "Poor / unclear cash-flow management", "Weak or no bankable business plan", "No acceptable collateral available", "No bank relationship", "Low financial literacy", "Loan documentation in progress"],
    },
    {
        "num": 2, "name": "Celsya And Family Investment", "sector": "Trade in Honey", "cat": 1,
        "priority": "High", "location": "Lira, Lira City, Corner Alira",
        "target": "Working Capital - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Both files",
        "gaps": ["No financial records kept", "Poor / unclear cash-flow management", "Weak or no bankable business plan", "No bank relationship", "Low financial literacy", "Loan documentation in progress", "Weak costing, budgeting, operational-cost management and internal controls"],
    },
    {
        "num": 3, "name": "Genas Home Millers", "sector": "Maize and Rice Milling", "cat": 1,
        "priority": "High", "location": "Lira City",
        "target": "Equipment - FSP in use: Bank of Africa",
        "fsp": "Bank of Africa", "source": "Both files",
        "gaps": ["Poor / unclear cash-flow management", "Weak or no bankable business plan", "No acceptable collateral available", "No bank relationship", "Low financial literacy", "Loan documentation in progress", "RDD rating below 50% (45%)", "Record keeping and documentation still need strengthening", "Weak costing, budgeting, operational-cost management and internal controls", "Has not yet visited the preferred financial service provider"],
    },
    {
        "num": 4, "name": "Lero Industries", "sector": "Grains milling Rice and Maize and sales of posho and Rice", "cat": 1,
        "priority": "High", "location": "Lira City",
        "target": "Working Capital - FSP in use: Post bank",
        "fsp": "Post Bank", "source": "Both files",
        "gaps": ["No financial records kept", "Poor / unclear cash-flow management", "Weak or no bankable business plan", "Low financial literacy", "Loan documentation in progress", "Weak costing, budgeting, operational-cost management and internal controls", "Has not yet visited the preferred financial service provider", "Active loan - repayment performance must be protected"],
    },
    {
        "num": 5, "name": "Mobile Detergent Group", "sector": "Detergents", "cat": 1,
        "priority": "High", "location": "Lira, City West, Ober Kampala",
        "target": "Business Capital - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Both files",
        "gaps": ["No financial records kept", "Poor / unclear cash-flow management", "No acceptable collateral available", "Low financial literacy", "Loan documentation in progress", "RDD rating below 50% (44%)", "Product certification (UNBS) pending, delaying scale-up and market/finance access", "Weak costing, budgeting, operational-cost management and internal controls", "Has not yet visited the preferred financial service provider"],
    },
    {
        "num": 6, "name": "Moen Farm Organic Uganda Limited", "sector": "Seed Suppliers", "cat": 1,
        "priority": "High", "location": "Otuke, Orum, Orum",
        "target": "Working Capital - FSP in use: Equity Bank,DFCU",
        "fsp": "Equity Bank", "source": "Both files",
        "gaps": ["Weak or no bankable business plan", "No acceptable collateral available", "Low financial literacy", "Loan documentation in progress", "Record keeping and documentation still need strengthening", "Weak costing, budgeting, operational-cost management and internal controls", "Limited linkage to financial institutions and wider markets", "Has not yet visited the preferred financial service provider"],
    },
    {
        "num": 7, "name": "Stev Agro", "sector": "Agro inputs", "cat": 1,
        "priority": "High", "location": "Omodo market,Anai,Lira city west",
        "target": "Top-up or expansion facility after a clean repayment record",
        "fsp": "Centenary Bank", "source": "Lango support form only",
        "gaps": ["No financial records kept", "Poor / unclear cash-flow management", "Weak or no bankable business plan", "No acceptable collateral available", "Low financial literacy", "Loan documentation not started", "Active loan - repayment performance must be protected"],
    },
    {
        "num": 8, "name": "Treuhand International Limited", "sector": "Grain milling (Maize)", "cat": 1,
        "priority": "High", "location": "Lira City, jinja camp",
        "target": "Working Capital - FSP in use: Housing Finance,Equity and Centenary Bank",
        "fsp": "Housing Finance Bank", "source": "Both files",
        "gaps": ["No financial records kept", "Loan documentation in progress", "Financial management training not yet completed", "Weak costing, budgeting, operational-cost management and internal controls", "Limited linkage to financial institutions and wider markets", "Has not yet visited the preferred financial service provider", "Active loan - repayment performance must be protected"],
    },
    {
        "num": 9, "name": "Abiviana Enterprises", "sector": "Agri-business", "cat": 1,
        "priority": "Medium", "location": "Awangemola road,Produce line, Lira City",
        "target": "Working Capital - FSP in use: Housing Finance",
        "fsp": "Housing Finance Bank", "source": "Mentorship grid only",
        "gaps": ["RDD rating below 50% (48%)", "Record keeping and documentation still need strengthening", "Financial forecasting / planning is weak", "Weak costing, budgeting, operational-cost management and internal controls"],
    },
    {
        "num": 10, "name": "Bandeko Unity Sotve", "sector": "Energy / Stoves", "cat": 1,
        "priority": "Medium", "location": "Ojwina Division,Lira City, LIRA City",
        "target": "Capital and audit of the books accounts - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Mentorship grid only",
        "gaps": ["Financial management training not yet completed", "Record keeping and documentation still need strengthening", "Books of account not yet audited / independently reviewed", "Market-access constraint noted by mentor: The business has good market but only needs improvement on record keeping"],
    },
    {
        "num": 11, "name": "Beatrice hope foundation", "sector": "Fish farming", "cat": 1,
        "priority": "Medium", "location": "Lira city",
        "target": "First-time working-capital loan sized to cash-flow capacity (bank or SACCO)",
        "fsp": "Post Bank", "source": "Lango support form only",
        "gaps": ["No financial records kept", "Weak or no bankable business plan", "Loan documentation not started"],
    },
    {
        "num": 12, "name": "Brownlee And Family Agro", "sector": "Agro input", "cat": 1,
        "priority": "Medium", "location": "Lira City",
        "target": "Working Capital - FSP in use: StandBick bank and Centenary Bank",
        "fsp": "Stanbic Bank", "source": "Both files",
        "gaps": ["Low financial literacy", "Record keeping and documentation still need strengthening", "Weak costing, budgeting, operational-cost management and internal controls", "Limited linkage to financial institutions and wider markets", "Has not yet visited the preferred financial service provider"],
    },
    {
        "num": 13, "name": "Cpn Millers", "sector": "Agro Processing", "cat": 1,
        "priority": "Medium", "location": "Aber Road Lira City West",
        "target": "Working capital - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Both files",
        "gaps": ["Weak or no bankable business plan", "No bank relationship", "Loan documentation not started", "RDD rating below 50% (46%)", "Record keeping and documentation still need strengthening", "Has not yet visited the preferred financial service provider"],
    },
    {
        "num": 14, "name": "Devine Miltonic Distrobution Campany Limited", "sector": "Produce and beverage depot", "cat": 1,
        "priority": "Medium", "location": "Teso bar,lira city west.",
        "target": "Servicing the loan - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Both files",
        "gaps": ["Poor / unclear cash-flow management", "Weak or no bankable business plan", "Loan documentation in progress", "Record keeping and documentation still need strengthening", "Running loan balance - repayment performance must be protected"],
    },
    {
        "num": 15, "name": "Fiapsowin Business Hub", "sector": "Business Services", "cat": 1,
        "priority": "Medium", "location": "Ngeta, Lira City, Lira City",
        "target": "Working capital - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Mentorship grid only",
        "gaps": ["Low financial health-check score (25%)", "RDD rating below 50% (43%)", "Record keeping and documentation still need strengthening", "Cash-flow tracking, cash reserves and separation of business/personal money need work"],
    },
    {
        "num": 16, "name": "Lira Diocese Multipurpose Cooperative Society Limited", "sector": "Agri business", "cat": 1,
        "priority": "Medium", "location": "Ojwina Division",
        "target": "Working Capital - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Both files",
        "gaps": ["No acceptable collateral available", "Low financial literacy", "Loan documentation not started", "Record keeping and documentation still need strengthening", "Weak costing, budgeting, operational-cost management and internal controls", "Has not yet visited the preferred financial service provider", "Active loan - repayment performance must be protected"],
    },
    {
        "num": 17, "name": "Nile Agro-imputs and Engineering Services Limited", "sector": "Mixed Enterprise", "cat": 1,
        "priority": "Medium", "location": "Lira,City East, Lela Apeta",
        "target": "Grant - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Both files",
        "gaps": ["Weak or no bankable business plan", "No acceptable collateral available", "Loan documentation in progress", "Record keeping and documentation still need strengthening", "Cash-flow tracking, cash reserves and separation of business/personal money need work", "Has not yet visited the preferred financial service provider"],
    },
    {
        "num": 18, "name": "Recio Innovations Enterprises", "sector": "Agro Processing", "cat": 1,
        "priority": "Medium", "location": "Omito Telela",
        "target": "Equipment and Working capital - FSP in use: Standbic Bank",
        "fsp": "Stanbic Bank", "source": "Both files",
        "gaps": ["No acceptable collateral available", "No bank relationship (mobile money only)", "Loan documentation in progress", "Record keeping and documentation still need strengthening", "Financial forecasting / planning is weak", "Weak costing, budgeting, operational-cost management and internal controls", "Market-access constraint noted by mentor: Need to enhance product advertisment and exhibition to create more markets", "Has not yet visited the preferred financial service provider"],
    },
    {
        "num": 19, "name": "Tamari-Cwao Investment Limited", "sector": "Agro Processing", "cat": 1,
        "priority": "Medium", "location": "Plot 74/75 , Station Road Junior Quarters, Lira City West Division",
        "target": "Capacity Bulding - FSP in use: DFCU Bank",
        "fsp": "DFCU Bank", "source": "Both files",
        "gaps": ["Poor / unclear cash-flow management", "Record keeping and documentation still need strengthening", "Financial forecasting / planning is weak", "Weak costing, budgeting, operational-cost management and internal controls", "Limited linkage to financial institutions and wider markets", "Has not yet visited the preferred financial service provider", "Active loan - repayment performance must be protected"],
    },
    {
        "num": 20, "name": "Bulshale Maize Millers Limited", "sector": "Grain Milling", "cat": 1,
        "priority": "Low", "location": "Nekyon close,Lira City West, Lira City",
        "target": "Working Capital - FSP in use: Equity Bank,KCB Bank,Centenary",
        "fsp": "Equity Bank", "source": "Mentorship grid only",
        "gaps": ["Record keeping and documentation still need strengthening", "Weak costing, budgeting, operational-cost management and internal controls", "Limited linkage to financial institutions and wider markets"],
    },
    {
        "num": 21, "name": "Sanctuary Harvest Bess.com", "sector": "Honey & Bee Products", "cat": 1,
        "priority": "Low", "location": "Kirombe,Lira Sub County, Lira City East",
        "target": "Financial Support. - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Mentorship grid only",
        "gaps": ["RDD rating below 50% (48%)", "Record keeping and documentation still need strengthening", "Weak costing, budgeting, operational-cost management and internal controls", "Growth constraint noted by mentor: Needs capacity building in processing honey and machines to help in value addition"],
    },

    # Category 2: Cash-Flow Management & Financial Discipline (14 MSMEs)
    {
        "num": 22, "name": "The Gerat Salvation Ministry", "sector": "Jelly Oil production", "cat": 2,
        "priority": "High", "location": "Lira city",
        "target": "Equipment - FSP in use: ABSA Bank",
        "fsp": "ABSA Bank", "source": "Both files",
        "gaps": ["Poor / unclear cash-flow management", "Weak or no bankable business plan", "Loan documentation not started", "Low financial health-check score (47%)", "Product certification (UNBS) pending, delaying scale-up and market/finance access", "Weak costing, budgeting, operational-cost management and internal controls"],
    },
    {
        "num": 23, "name": "Besu Golden Technical and General Supplies Uganda Limited", "sector": "General Supplies, Merchandise, Construction, Hotel", "cat": 2,
        "priority": "Medium", "location": "CITY EAST DIVISION, LIRA CITY",
        "target": "Has arunning loan - FSP in use: ABSA",
        "fsp": "ABSA Bank", "source": "Both files",
        "gaps": ["Poor / unclear cash-flow management", "Weak or no bankable business plan", "Low financial literacy", "Loan documentation in progress", "Weak costing, budgeting, operational-cost management and internal controls", "Running loan balance - repayment performance must be protected"],
    },
    {
        "num": 24, "name": "Famers with a mission Uganda", "sector": "Aquaculture", "cat": 2,
        "priority": "Medium", "location": "Barogole",
        "target": "Business Loan - FSP in use: Post Bank",
        "fsp": "Post Bank", "source": "Both files",
        "gaps": ["Poor / unclear cash-flow management", "Weak or no bankable business plan", "No acceptable collateral available", "Loan documentation in progress", "Financial management training not yet completed", "RDD rating below 50% (46%)", "Growth constraint noted by mentor: There is need for more capital to expand the business"],
    },
    {
        "num": 25, "name": "Freeplus Foundation", "sector": "Training and Craft Centre", "cat": 2,
        "priority": "Medium", "location": "lira, city west, Anai",
        "target": "First-time working-capital loan sized to cash-flow capacity (bank or SACCO)",
        "fsp": "Post Bank", "source": "Lango support form only",
        "gaps": ["Poor / unclear cash-flow management", "Weak or no bankable business plan", "Low financial literacy", "Loan documentation in progress"],
    },
    {
        "num": 26, "name": "Keri Naturals", "sector": "Trading in shea butter, shea oil, lotions", "cat": 2,
        "priority": "Medium", "location": "Lira",
        "target": "First-time working-capital loan sized to cash-flow capacity (bank or SACCO)",
        "fsp": "Centenary Bank", "source": "Lango support form only",
        "gaps": ["Poor / unclear cash-flow management", "Weak or no bankable business plan", "No acceptable collateral available", "Low financial literacy", "Loan documentation in progress"],
    },
    {
        "num": 27, "name": "Kingly Business Hub", "sector": "Jelly smearing oil production", "cat": 2,
        "priority": "Medium", "location": "Lira city",
        "target": "First small loan: SACCO/group-based credit before graduating to a bank",
        "fsp": "SACCO", "source": "Lango support form only",
        "gaps": ["Poor / unclear cash-flow management", "Weak or no bankable business plan", "No acceptable collateral available", "No bank relationship", "Loan documentation not started"],
    },
    {
        "num": 28, "name": "Kwania organic harvest", "sector": "Spices", "cat": 2,
        "priority": "Medium", "location": "Sankofa building,lira city centre",
        "target": "First-time working-capital loan sized to cash-flow capacity (bank or SACCO)",
        "fsp": "Post Bank", "source": "Lango support form only",
        "gaps": ["Poor / unclear cash-flow management", "Weak or no bankable business plan", "No acceptable collateral available", "No bank relationship", "Loan documentation not started"],
    },
    {
        "num": 29, "name": "Milajo General Traders", "sector": "Mixed enterprise", "cat": 2,
        "priority": "Medium", "location": "Lira, Lira City West, Telela B",
        "target": "Working Capital - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Both files",
        "gaps": ["Poor / unclear cash-flow management", "Low financial literacy", "Relies on costly mobile-lender credit rather than a bank facility", "Loan documentation in progress", "RDD rating below 50% (46%)", "Weak costing, budgeting, operational-cost management and internal controls", "Limited linkage to financial institutions and wider markets", "Has not yet visited the preferred financial service provider"],
    },
    {
        "num": 30, "name": "Nemima Agro- Consult Hub", "sector": "Wine Making", "cat": 2,
        "priority": "Medium", "location": "Lira City",
        "target": "Equipment and working capital - FSP in use: Standbic Bank",
        "fsp": "Stanbic Bank", "source": "Both files",
        "gaps": ["Poor / unclear cash-flow management", "Weak or no bankable business plan", "Weak costing, budgeting, operational-cost management and internal controls", "Limited linkage to financial institutions and wider markets", "Active loan - repayment performance must be protected"],
    },
    {
        "num": 31, "name": "Oyster Mushrooms Production", "sector": "Mushroom farming", "cat": 2,
        "priority": "Medium", "location": "Amuca, Lira City West., Lira City",
        "target": "Business Capital - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Mentorship grid only",
        "gaps": ["Low financial health-check score (33%)", "RDD rating below 50% (43%)", "Cash-flow tracking, cash reserves and separation of business/personal money need work", "Financial forecasting / planning is weak", "Weak costing, budgeting, operational-cost management and internal controls", "Growth constraint noted by mentor: The mushroom farming is promising but lacks capital to scale it up"],
    },
    {
        "num": 32, "name": "Telela Victoria farm", "sector": "Poultry", "cat": 2,
        "priority": "Medium", "location": "Lira city",
        "target": "Top-up or expansion facility after a clean repayment record",
        "fsp": "Centenary Bank", "source": "Lango support form only",
        "gaps": ["Poor / unclear cash-flow management", "Weak or no bankable business plan", "No bank relationship", "Loan documentation not started", "Active loan - repayment performance must be protected"],
    },
    {
        "num": 33, "name": "Gracious Investiment Limited", "sector": "General Trading", "cat": 2,
        "priority": "Low", "location": "Anai Agalibypass cell, Lira City",
        "target": "Grant - FSP in use: DFCU and Centeray Bank",
        "fsp": "DFCU Bank", "source": "Mentorship grid only",
        "gaps": ["Cash-flow tracking, cash reserves and separation of business/personal money need work"],
    },
    {
        "num": 34, "name": "Itek okile rice growers", "sector": "Rice growing", "cat": 2,
        "priority": "Low", "location": "Abalet trading centre,itek s/c,Erute south,Lira district",
        "target": "First-time working-capital loan sized to cash-flow capacity (bank or SACCO)",
        "fsp": "Post Bank", "source": "Lango support form only",
        "gaps": ["Poor / unclear cash-flow management", "Loan documentation not started"],
    },
    {
        "num": 35, "name": "Mesi construction company limited", "sector": "Construction and supply", "cat": 2,
        "priority": "Low", "location": "Lira city",
        "target": "Top-up or expansion facility after a clean repayment record",
        "fsp": "Post Bank", "source": "Lango support form only",
        "gaps": ["Poor / unclear cash-flow management", "Loan documentation in progress", "Active loan - repayment performance must be protected"],
    },

    # Category 3: Business Plan & Financial Projection Development (10 MSMEs)
    {
        "num": 36, "name": "Akwangi Ug Ltd", "sector": "Agro processing", "cat": 3,
        "priority": "Medium", "location": "Alebtong, Apala Town Council, Apala",
        "target": "Graduate from SACCO credit to a bank working-capital or asset loan",
        "fsp": "Post Bank", "source": "Lango support form only",
        "gaps": ["Weak or no bankable business plan", "No acceptable collateral available", "No bank relationship", "Low financial literacy", "Loan documentation in progress"],
    },
    {
        "num": 37, "name": "Harrscom Poultry Farm", "sector": "Poultry", "cat": 3,
        "priority": "Medium", "location": "Adwoki Dokolo",
        "target": "First-time working-capital loan sized to cash-flow capacity (bank or SACCO)",
        "fsp": "Post Bank", "source": "Lango support form only",
        "gaps": ["Weak or no bankable business plan", "No acceptable collateral available", "No bank relationship (mobile money only)", "Loan documentation in progress"],
    },
    {
        "num": 38, "name": "Apwoyo Investment", "sector": "Agri-business", "cat": 3,
        "priority": "Low", "location": "Awita cell,Amuca Parish, Lira City",
        "target": "Working Capital - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Mentorship grid only",
        "gaps": ["Financial forecasting / planning is weak", "Weak costing, budgeting, operational-cost management and internal controls", "Has not yet visited the preferred financial service provider"],
    },
    {
        "num": 39, "name": "Devine Samaritan Uganda Limited", "sector": "Grain milling-Maize value addition", "cat": 3,
        "priority": "Low", "location": "Lira city",
        "target": "Top-up or expansion facility after a clean repayment record",
        "fsp": "Centenary Bank", "source": "Lango support form only",
        "gaps": ["Weak or no bankable business plan", "Loan documentation not started", "Active loan - repayment performance must be protected"],
    },
    {
        "num": 40, "name": "Dynamic Farm Enterprise", "sector": "Farm Inputs & Seedlings", "cat": 3,
        "priority": "Low", "location": "Lira City, Lira City",
        "target": "Business Loan - FSP in use: DFCU",
        "fsp": "DFCU Bank", "source": "Mentorship grid only",
        "gaps": ["Financial forecasting / planning is weak", "Weak costing, budgeting, operational-cost management and internal controls", "Market-access constraint noted by mentor: Dynamic Farm enterprise is dealing in quality seedlings and other farm products which is highly on the market demand and is improving on its management that is good for its growth"],
    },
    {
        "num": 41, "name": "Isidi Farm Supply", "sector": "Agro Input", "cat": 3,
        "priority": "Low", "location": "Bata Town Council",
        "target": "First-time working-capital loan sized to cash-flow capacity (bank or SACCO)",
        "fsp": "Centenary Bank", "source": "Lango support form only",
        "gaps": ["Weak or no bankable business plan", "Loan documentation not started"],
    },
    {
        "num": 42, "name": "O.P.G Family Agroinputs", "sector": "Agroinput", "cat": 3,
        "priority": "Low", "location": "Lira city",
        "target": "First-time working-capital loan sized to cash-flow capacity (bank or SACCO)",
        "fsp": "Post Bank", "source": "Lango support form only",
        "gaps": ["Weak or no bankable business plan", "No bank relationship", "Loan documentation not started"],
    },
    {
        "num": 43, "name": "Tal Youth Uganda", "sector": "Youth Enterprise", "cat": 3,
        "priority": "Low", "location": "Ereda Camber,Lira City East, Lira City",
        "target": "Business Capital - FSP in use: DFCU",
        "fsp": "DFCU Bank", "source": "Mentorship grid only",
        "gaps": ["Financial forecasting / planning is weak", "Weak costing, budgeting, operational-cost management and internal controls"],
    },
    {
        "num": 44, "name": "Tonville gardeners", "sector": "Nursery bed", "cat": 3,
        "priority": "Low", "location": "Alito camp,gombolola lira,lira city west",
        "target": "Top-up or expansion facility after a clean repayment record",
        "fsp": "Post Bank", "source": "Lango support form only",
        "gaps": ["Weak or no bankable business plan", "Loan documentation not started", "Active loan - repayment performance must be protected"],
    },
    {
        "num": 45, "name": "Youth For Life Tree Planting LTD", "sector": "Tree Planting & Forestry", "cat": 3,
        "priority": "Low", "location": "Amuca, Lira City West., Lira City",
        "target": "Business Loan - FSP in use: KCB Bank",
        "fsp": "KCB Bank", "source": "Mentorship grid only",
        "gaps": ["Financial forecasting / planning is weak", "Weak costing, budgeting, operational-cost management and internal controls"],
    },

    # Category 4: Collateral & Alternative Security Solutions (3 MSMEs)
    {
        "num": 46, "name": "Abimac Business Link", "sector": "Agro processing", "cat": 4,
        "priority": "Medium", "location": "Telela Omito Lira city West Division",
        "target": "Working Capital - FSP in use: Stanbic Bank",
        "fsp": "Stanbic Bank", "source": "Both files",
        "gaps": ["No acceptable collateral available", "No bank relationship (mobile money only)", "Loan documentation in progress", "RDD rating below 50% (45%)", "Weak costing, budgeting, operational-cost management and internal controls", "Limited linkage to financial institutions and wider markets"],
    },
    {
        "num": 47, "name": "Isofarm Crop Care Company Limited", "sector": "Agro Input Dealer", "cat": 4,
        "priority": "Low", "location": "Lira, Bar, Bar",
        "target": "Graduate from SACCO credit to a bank working-capital or asset loan",
        "fsp": "Centenary Bank", "source": "Lango support form only",
        "gaps": ["No acceptable collateral available", "Loan documentation in progress"],
    },
    {
        "num": 48, "name": "Organic Route Uganda Ltd", "sector": "Agro processing", "cat": 4,
        "priority": "Low", "location": "Junior quarters",
        "target": "Repeat / larger bank facility using the completed-loan history",
        "fsp": "Stanbic Bank", "source": "Lango support form only",
        "gaps": ["No acceptable collateral available", "Loan documentation in progress"],
    },

    # Category 5: Banking Relationship & Financial-Institution Linkage (1 MSME)
    {
        "num": 49, "name": "Archways Agro Farm Limited", "sector": "Agro Farm", "cat": 5,
        "priority": "Low", "location": "PLOT 6/8, MARUZI ROAD, Lira City",
        "target": "Working Capital - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Mentorship grid only",
        "gaps": ["Weak costing, budgeting, operational-cost management and internal controls", "Limited linkage to financial institutions and wider markets"],
    },

    # Category 6: Financial Literacy, Costing & Management Capacity Building (13 MSMEs)
    {
        "num": 50, "name": "Anopa Developers", "sector": "Real Estate / Construction", "cat": 6,
        "priority": "Low", "location": "Kirombe,Lira Sub County, Lira City East",
        "target": "Business Loan - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Mentorship grid only",
        "gaps": ["Weak costing, budgeting, operational-cost management and internal controls", "Growth constraint noted by mentor: The poultry farming is picking well but needs more capital to expand it"],
    },
    {
        "num": 51, "name": "Ayitek Business Solutions U Ltd", "sector": "Business Solutions", "cat": 6,
        "priority": "Low", "location": "Lira City, Lira City",
        "target": "Working capital - FSP in use: DFCU",
        "fsp": "DFCU Bank", "source": "Mentorship grid only",
        "gaps": ["RDD rating below 50% (49%)", "Weak costing, budgeting, operational-cost management and internal controls"],
    },
    {
        "num": 52, "name": "Bedmot company", "sector": "Manufacturing of plastic interlocking bricks and pavers", "cat": 6,
        "priority": "Low", "location": "Boroboro,lira city east",
        "target": "First-time working-capital loan sized to cash-flow capacity (bank or SACCO)",
        "fsp": "Post Bank", "source": "Lango support form only",
        "gaps": ["Low financial literacy", "Loan documentation in progress"],
    },
    {
        "num": 53, "name": "Devine Organic Foods", "sector": "Organic Foods", "cat": 6,
        "priority": "Low", "location": "Lira City, Lira City",
        "target": "Business Capital - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Mentorship grid only",
        "gaps": ["Weak costing, budgeting, operational-cost management and internal controls"],
    },
    {
        "num": 54, "name": "Govi Famers Multipurpose Cooperative Society", "sector": "Cooperative / Agri", "cat": 6,
        "priority": "Low", "location": "Gomi Trading Center,Lira City, Lira City",
        "target": "Business Loan - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Mentorship grid only",
        "gaps": ["Weak costing, budgeting, operational-cost management and internal controls"],
    },
    {
        "num": 55, "name": "Grace Agro Seeds Ltd", "sector": "Agro Seeds", "cat": 6,
        "priority": "Low", "location": "Lira City, LIRA City",
        "target": "Working capital - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Mentorship grid only",
        "gaps": ["RDD rating below 50% (45%)", "Weak costing, budgeting, operational-cost management and internal controls", "Has not yet visited the preferred financial service provider"],
    },
    {
        "num": 56, "name": "Hiseas Tradix Lit", "sector": "General Trading", "cat": 6,
        "priority": "Low", "location": "kwania Road oppsite Quest Petroal Station, Lira City, Lira City",
        "target": "FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Mentorship grid only",
        "gaps": ["Weak costing, budgeting, operational-cost management and internal controls"],
    },
    {
        "num": 57, "name": "Kalimopal Enterprise Uganda Ltd", "sector": "General Enterprise", "cat": 6,
        "priority": "Low", "location": "Lira City, Lira City East",
        "target": "Business Loan - FSP in use: DFCU",
        "fsp": "DFCU Bank", "source": "Mentorship grid only",
        "gaps": ["Weak costing, budgeting, operational-cost management and internal controls"],
    },
    {
        "num": 58, "name": "Nibble Millers", "sector": "Milling", "cat": 6,
        "priority": "Low", "location": "Wigweng,lira city",
        "target": "Working Capital - FSP in use: Post Bank",
        "fsp": "Post Bank", "source": "Both files",
        "gaps": ["Loan documentation in progress", "Weak costing, budgeting, operational-cost management and internal controls", "Has not yet visited the preferred financial service provider", "Active loan - repayment performance must be protected"],
    },
    {
        "num": 59, "name": "Trisum Holdings Limited", "sector": "Holdings / Investments", "cat": 6,
        "priority": "Low", "location": "Bar-Apwoa, Lira City",
        "target": "Working Capital - FSP in use: Equity Bank",
        "fsp": "Equity Bank", "source": "Mentorship grid only",
        "gaps": ["Weak costing, budgeting, operational-cost management and internal controls", "Market-access constraint noted by mentor: Need to enhance product advertisment and exhibition to create more markets", "Has not yet visited the preferred financial service provider"],
    },
    {
        "num": 60, "name": "VART Africa Solutions Limited", "sector": "IT / Tech Solutions", "cat": 6,
        "priority": "Low", "location": "Plot 20,Erute Road, Senor Quater, Lira City, Lira City",
        "target": "Capital - FSP in use: Housing Finance Bank",
        "fsp": "Housing Finance Bank", "source": "Mentorship grid only",
        "gaps": ["Weak costing, budgeting, operational-cost management and internal controls", "Has not yet visited the preferred financial service provider"],
    },
    {
        "num": 61, "name": "XS Multimedia Campany", "sector": "Media / Photography", "cat": 6,
        "priority": "Low", "location": "Uhuru Bar,Lira City, Lira City",
        "target": "Business Loan - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Mentorship grid only",
        "gaps": ["Weak costing, budgeting, operational-cost management and internal controls", "Market-access constraint noted by mentor: XS-Multimedia has good marketing strategies that should be aligned to business management practices for proper progress"],
    },
    {
        "num": 62, "name": "Yodeli Social Foundation Limited", "sector": "Social Enterprise", "cat": 6,
        "priority": "Low", "location": "Angwetangwet A, Lira City East, Lira City",
        "target": "Working Capital and Equipment - FSP in use: Housing Finance",
        "fsp": "Housing Finance Bank", "source": "Mentorship grid only",
        "gaps": ["Weak costing, budgeting, operational-cost management and internal controls", "Has not yet visited the preferred financial service provider"],
    },

    # Category 7: Loan Application & Investment Readiness (Finance-Ready) (3 MSMEs)
    {
        "num": 63, "name": "Barkman Best Bee Ltd", "sector": "Beekeeping & Honey", "cat": 7,
        "priority": "Low", "location": "Obote Avenue, oppt Feroz,Lira City, LIRA City",
        "target": "Capital - FSP in use: DFCU and Centeray Bank",
        "fsp": "DFCU Bank", "source": "Mentorship grid only",
        "gaps": ["No major gap recorded; ready to apply, but a complete application pack and product match are still needed"],
    },
    {
        "num": 64, "name": "Congratulations and Repair", "sector": "Computer supply", "cat": 7,
        "priority": "Low", "location": "Etit cell, central Ward,loro town council",
        "target": "Repeat / larger bank facility using the completed-loan history",
        "fsp": "Stanbic Bank", "source": "Lango support form only",
        "gaps": ["No major gap recorded; ready to apply, but a complete application pack and product match are still needed"],
    },
    {
        "num": 65, "name": "Unicraft Farm Ltd", "sector": "Poultry and livestock", "cat": 7,
        "priority": "Low", "location": "Adur village",
        "target": "Repeat / larger bank facility using the completed-loan history",
        "fsp": "Centenary Bank", "source": "Lango support form only",
        "gaps": ["Loan documentation in progress"],
    },

    # Category 8: Debt Management & Credit Growth (2 MSMEs)
    {
        "num": 66, "name": "Akalo producer cooperative society Ltd", "sector": "Produce", "cat": 8,
        "priority": "Low", "location": "Akalo center",
        "target": "Top-up or expansion facility after a clean repayment record",
        "fsp": "Centenary Bank", "source": "Lango support form only",
        "gaps": ["Loan documentation in progress", "Active loan - repayment performance must be protected"],
    },
    {
        "num": 67, "name": "Animal Mixed farm", "sector": "Animal farming", "cat": 8,
        "priority": "Low", "location": "Mwyene(Oyam, Landon village",
        "target": "Top-up or expansion facility after a clean repayment record",
        "fsp": "Post Bank", "source": "Lango support form only",
        "gaps": ["Loan documentation in progress", "Active loan - repayment performance must be protected"],
    },

    # Category 9: Formalisation, Audit & Certification (17 MSMEs)
    {
        "num": 68, "name": "Aisu Shea Ventures Ltd", "sector": "Shea Seeds", "cat": 9,
        "priority": "High", "location": "Otuke, Orum ,Orum",
        "target": "Graduate from SACCO credit to a bank working-capital or asset loan",
        "fsp": "Centenary Bank", "source": "Lango support form only",
        "gaps": ["Business is not formally registered", "No financial records kept", "Poor / unclear cash-flow management", "Weak or no bankable business plan", "No acceptable collateral available", "Low financial literacy", "Loan documentation in progress"],
    },
    {
        "num": 69, "name": "Ajavic Mixed Farm", "sector": "Mixed farm", "cat": 9,
        "priority": "High", "location": "Ongica B ,Burlobo,lira city East",
        "target": "Working Capital - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Both files",
        "gaps": ["Business is not formally registered", "No financial records kept", "Poor / unclear cash-flow management", "Weak or no bankable business plan", "No acceptable collateral available", "No bank relationship", "Loan documentation in progress", "Financial management training not yet completed", "Low financial health-check score (48%)", "RDD rating below 50% (47%)", "Weak costing, budgeting, operational-cost management and internal controls", "Growth constraint noted by mentor: Lack of capital to purchase modern bee heives hence affecting production", "Has not yet visited the preferred financial service provider"],
    },
    {
        "num": 70, "name": "Akosol Poultry Farm", "sector": "Poultry", "cat": 9,
        "priority": "High", "location": "Dokolo district, Adok Subcounty, Aisha Memorial",
        "target": "First-time working-capital loan sized to cash-flow capacity (bank or SACCO)",
        "fsp": "Post Bank", "source": "Lango support form only",
        "gaps": ["Business is not formally registered", "Weak or no bankable business plan", "No acceptable collateral available", "No bank relationship (mobile money only)", "Loan documentation in progress"],
    },
    {
        "num": 71, "name": "Amsag innovation limited", "sector": "Clothing and shoes selling", "cat": 9,
        "priority": "High", "location": "Lira city",
        "target": "First-time working-capital loan sized to cash-flow capacity (bank or SACCO)",
        "fsp": "Centenary Bank", "source": "Lango support form only",
        "gaps": ["Business is not formally registered", "No financial records kept", "Poor / unclear cash-flow management", "Weak or no bankable business plan", "No acceptable collateral available", "No bank relationship", "Loan documentation not started"],
    },
    {
        "num": 72, "name": "Atlan Plus Investment", "sector": "General merchandise", "cat": 9,
        "priority": "High", "location": "Lira city",
        "target": "First small loan: SACCO/group-based credit before graduating to a bank",
        "fsp": "SACCO", "source": "Lango support form only",
        "gaps": ["Business is not formally registered", "No financial records kept", "Poor / unclear cash-flow management", "Weak or no bankable business plan", "No acceptable collateral available", "No bank relationship", "Low financial literacy", "Loan documentation not started"],
    },
    {
        "num": 73, "name": "Barlonyo Farm Inputs", "sector": "Agro Inputs", "cat": 9,
        "priority": "High", "location": "Lira, Ogur, Barlonyo",
        "target": "Graduate from SACCO credit to a bank working-capital or asset loan",
        "fsp": "Centenary Bank", "source": "Lango support form only",
        "gaps": ["Business is not formally registered", "No financial records kept", "Poor / unclear cash-flow management", "Weak or no bankable business plan", "No acceptable collateral available", "Low financial literacy", "Loan documentation not started"],
    },
    {
        "num": 74, "name": "Damimah Invesntions", "sector": "Coffee Processing", "cat": 9,
        "priority": "High", "location": "LIRA",
        "target": "First-time working-capital loan sized to cash-flow capacity (bank or SACCO)",
        "fsp": "Post Bank", "source": "Lango support form only",
        "gaps": ["Business is not formally registered", "Poor / unclear cash-flow management", "Weak or no bankable business plan", "Low financial literacy", "Loan documentation in progress"],
    },
    {
        "num": 75, "name": "Geoffrey and Family Electric Centre", "sector": "Electronics", "cat": 9,
        "priority": "High", "location": "Otuke, Orum,Orum",
        "target": "Graduate from SACCO credit to a bank working-capital or asset loan",
        "fsp": "Centenary Bank", "source": "Lango support form only",
        "gaps": ["Business is not formally registered", "No financial records kept", "Poor / unclear cash-flow management", "Weak or no bankable business plan", "No acceptable collateral available", "Low financial literacy", "Loan documentation in progress"],
    },
    {
        "num": 76, "name": "Increase", "sector": "Poultry", "cat": 9,
        "priority": "High", "location": "Jinja camp B,lira city west",
        "target": "Top-up or expansion facility after a clean repayment record",
        "fsp": "Post Bank", "source": "Lango support form only",
        "gaps": ["Business is not formally registered", "No financial records kept", "Poor / unclear cash-flow management", "Weak or no bankable business plan", "No acceptable collateral available", "Low financial literacy", "Loan documentation not started", "Active loan - repayment performance must be protected"],
    },
    {
        "num": 77, "name": "Jovita nursery bed", "sector": "Nursary bed", "cat": 9,
        "priority": "High", "location": "Front page,alito camp,lira city",
        "target": "First small loan: SACCO/group-based credit before graduating to a bank",
        "fsp": "SACCO", "source": "Lango support form only",
        "gaps": ["Business is not formally registered", "No financial records kept", "Poor / unclear cash-flow management", "Weak or no bankable business plan", "No acceptable collateral available", "No bank relationship", "Low financial literacy", "Loan documentation not started"],
    },
    {
        "num": 78, "name": "Midrock Investment Limited", "sector": "Agri business", "cat": 9,
        "priority": "High", "location": "Adwoki",
        "target": "First-time working-capital loan sized to cash-flow capacity (bank or SACCO)",
        "fsp": "Post Bank", "source": "Lango support form only",
        "gaps": ["Business is not formally registered", "Weak or no bankable business plan", "No acceptable collateral available", "No bank relationship (mobile money only)", "Loan documentation not started"],
    },
    {
        "num": 79, "name": "Shamix house of buttons", "sector": "Materials and tailoring", "cat": 9,
        "priority": "High", "location": "Rainbow ,lira city west",
        "target": "Repeat / larger bank facility using the completed-loan history",
        "fsp": "Stanbic Bank", "source": "Lango support form only",
        "gaps": ["Business is not formally registered", "No financial records kept", "Poor / unclear cash-flow management", "Weak or no bankable business plan", "No acceptable collateral available", "No bank relationship (mobile money only)", "Low financial literacy", "Loan documentation not started"],
    },
    {
        "num": 80, "name": "SOS pastries", "sector": "Pasties- Bakery", "cat": 9,
        "priority": "High", "location": "Lira city",
        "target": "Top-up or expansion facility after a clean repayment record",
        "fsp": "Centenary Bank", "source": "Lango support form only",
        "gaps": ["Business is not formally registered", "No financial records kept", "Poor / unclear cash-flow management", "Weak or no bankable business plan", "No acceptable collateral available", "No bank relationship", "Loan documentation not started"],
    },
    {
        "num": 81, "name": "Brenny fashions", "sector": "Boutique", "cat": 9,
        "priority": "Medium", "location": "Main market lira city",
        "target": "Business Capital - FSP in use: Bank of Africa",
        "fsp": "Bank of Africa", "source": "Both files",
        "gaps": ["Business is not formally registered", "Weak or no bankable business plan", "Loan documentation in progress"],
    },
    {
        "num": 82, "name": "Margrace poultry farm", "sector": "Poultry and farming", "cat": 9,
        "priority": "Medium", "location": "Obanga pewany,soroti road',lira city east",
        "target": "Business Loan - FSP in use: DFCU and Centeray Bank",
        "fsp": "DFCU Bank", "source": "Mentorship grid only",
        "gaps": ["Business is not formally registered", "No acceptable collateral available", "Loan documentation not started", "Active loan - repayment performance must be protected"],
    },
    {
        "num": 83, "name": "Bobllins Associates Limited", "sector": "General merchandise and General supplies", "cat": 9,
        "priority": "Low", "location": "Lira City",
        "target": "Working Capital - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Mentorship grid only",
        "gaps": ["No bank relationship", "Loan documentation in progress", "Books of account not yet audited / independently reviewed"],
    },
    {
        "num": 84, "name": "Nature Hub Lira", "sector": "Agro / Environmental Hub", "cat": 9,
        "priority": "Low", "location": "Lira City, Lira City",
        "target": "Working Capital - FSP in use: Centenary Bank",
        "fsp": "Centenary Bank", "source": "Mentorship grid only",
        "gaps": ["Books of account not yet audited / independently reviewed", "Weak costing, budgeting, operational-cost management and internal controls", "Has not yet visited the preferred financial service provider"],
    },
]


class Command(BaseCommand):
    help = "Seed the 84 MSME Financial Improvement Action Plans for Lira / Lango sub-region."

    def handle(self, *args, **options):
        self.stdout.write("Seeding 84 Lango / Lira Financial Improvement Action Plans...")
        
        # Get category lookup by number
        cat_by_num = {c["number"]: c for c in FIAP_CATEGORIES}

        # Try to find a default BGE in Lango or first available BGE
        default_bge = BusinessGrowthExpert.objects.filter(location__icontains="Lango").first()
        if not default_bge:
            default_bge = BusinessGrowthExpert.objects.first()

        created_count = 0
        updated_count = 0

        for item in FIAP_DATA:
            raw_name = item["name"]
            cat_num = item["cat"]
            cat_meta = cat_by_num.get(cat_num, {})
            cat_id = cat_meta.get("id", "1_financial_records")
            priority = item["priority"]
            target = item["target"]
            preferred_fsp = item["fsp"]
            gaps = item["gaps"]

            # Generate tailored steps matching default roadmap for this category
            steps = [
                {
                    "step_number": idx + 1,
                    "action": step.get("action", ""),
                    "timeline": step.get("timeline", "Months 1-3"),
                    "responsible": step.get("responsible", "MSME Owner & BGE"),
                    "verification": step.get("verification", "Field verification"),
                    "status": "planned",
                }
                for idx, step in enumerate(cat_meta.get("default_steps", []))
            ]

            # Look up MSME in database
            clean_name = re.sub(r"[^\w\s]", "", raw_name).strip()
            first_word = clean_name.split()[0] if clean_name else raw_name
            
            msme = (
                MSME.objects.filter(business_name__icontains=clean_name).first()
                or MSME.objects.filter(business_name__icontains=first_word).first()
            )

            # If not found, create a placeholder MSME with the info
            if not msme:
                msme = MSME.objects.create(
                    business_name=raw_name,
                    sector=item["sector"],
                    district="Lira",
                    address=item["location"],
                    assigned_bge=default_bge,
                    status="active",
                )
                self.stdout.write(f"  [+] Created MSME record for {raw_name}")

            # Assign BGE if missing
            bge = msme.assigned_bge or default_bge
            has_active_loan = any("active loan" in g.lower() or "running loan" in g.lower() for g in gaps)

            plan, created = FinancialImprovementActionPlan.objects.update_or_create(
                msme=msme,
                defaults={
                    "bge": bge,
                    "assessment_date": date(2024, 6, 1),
                    "category": cat_id,
                    "category_name": cat_meta.get("name", f"Category {cat_num}"),
                    "category_addresses": cat_meta.get("what_it_addresses", ""),
                    "support_priority": priority,
                    "status": "approved" if priority == "Low" else "submitted",
                    "financing_target": target,
                    "preferred_fsp": preferred_fsp,
                    "has_active_loan": has_active_loan,
                    "gaps_identified": gaps,
                    "gap_notes": f"Seeded from official PRUDEV II Lira/Lango access to finance summary ({item['source']}). Location: {item['location']}.",
                    "action_plan_steps": steps,
                    "bge_signature_name": bge.name if bge else "PRUDEV II BGE Advisor",
                    "bge_signed_at": date(2024, 6, 1),
                    "bge_signed": True,
                    "data_source": item["source"],
                }
            )

            if created:
                created_count += 1
            else:
                updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully seeded FIAP records: {created_count} created, {updated_count} updated. Total: {FinancialImprovementActionPlan.objects.count()}"
            )
        )
