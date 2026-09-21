// Catalog of Turkish market / macro data sources, mirroring the reference platform.
//
// Each source is tagged by how it can be consumed:
//   "live"     – wired to a real API/feed; returns numbers (see ./tcmb, ./bist, ...)
//   "scrape"   – has no API; an HTML scraper can be added incrementally
//   "citation" – PDF/report portal; cited by name + link, no machine-readable feed
//
// The report generator cites every source's `name` + `url` in the "Kaynak damgasi"
// section; live sources additionally inject real values into the prompt.

export type SourceTier = "live" | "scrape" | "citation";

export type SourceDef = {
  code: string;        // stable slug used in code/env
  name: string;        // display name (Turkish)
  content: string;     // what it provides
  url: string;         // official link
  tier: SourceTier;
  group: "resmi" | "banka";  // official institutions vs bank/market research
};

export const SOURCES: SourceDef[] = [
  // --- 9.x Resmi / kurumsal kaynaklar ---
  { code: "tcmb", name: "TCMB", content: "Faiz, doviz kurlari, rezervler, para politikasi, enflasyon, PPK takvimi", url: "https://www.tcmb.gov.tr/wps/wcm/connect/tr/tcmb+tr/main+menu/istatistikler", tier: "live", group: "resmi" },
  { code: "tuik", name: "TUIK", content: "Enflasyon (TUFE manset/cekirdek) - OECD/TUIK serisi uzerinden canli", url: "https://data.tuik.gov.tr", tier: "live", group: "resmi" },
  { code: "bist", name: "Borsa Istanbul (BIST)", content: "Hisse fiyatlari, endeks, islem hacmi, piyasa degerleri", url: "https://www.borsaistanbul.com/tr/sayfa/3174/veriler", tier: "live", group: "resmi" },
  { code: "tefas", name: "TEFAS", content: "Yatirim fonu verileri", url: "https://www.tefas.gov.tr", tier: "live", group: "resmi" },
  { code: "kap", name: "KAP", content: "Kamuyu Aydinlatma Platformu - sirket bildirimleri/ozel durum aciklamalari", url: "https://www.kap.org.tr", tier: "scrape", group: "resmi" },
  { code: "bddk", name: "BDDK", content: "Bankacilik bilanco, kredi hacmi, mevduat oranlari", url: "https://www.bddk.org.tr/BultenAylik", tier: "scrape", group: "resmi" },
  { code: "hmb", name: "Hazine ve Maliye Bakanligi", content: "Kamu borcu, butce sonuclari, mali istikrar", url: "https://www.hmb.gov.tr", tier: "citation", group: "resmi" },
  { code: "spk", name: "SPK", content: "Yatirim fonu, borsa ve araci kurulus verileri", url: "https://www.spk.gov.tr/istatistikler", tier: "citation", group: "resmi" },
  { code: "tspb", name: "TSPB", content: "Sermaye piyasalari, portfoy yonetim verileri", url: "https://www.tspb.org.tr/tr/veriler", tier: "citation", group: "resmi" },
  { code: "tobb", name: "TOBB", content: "Sektorel raporlar, ticaret hacmi, kapasite", url: "https://www.tobb.org.tr", tier: "citation", group: "resmi" },
  { code: "tepav", name: "TEPAV", content: "Buyume tahminleri, sektorel analiz", url: "https://www.tepav.org.tr", tier: "citation", group: "resmi" },
  { code: "mkk", name: "MKK (Merkezi Kayit Ist.)", content: "Pay senetleri ve sermaye piyasasi istatistikleri", url: "https://www.mkk.com.tr", tier: "scrape", group: "resmi" },
  { code: "takasbank", name: "Takasbank", content: "Coklu piyasa (emtia, enerji, kiymetli maden) istatistikleri", url: "https://www.takasbank.com.tr", tier: "scrape", group: "resmi" },
  { code: "kgk", name: "KGK (TFRS)", content: "Bagimsiz denetim ve denetci istatistikleri", url: "https://www.kgk.gov.tr", tier: "citation", group: "resmi" },
  { code: "kgf", name: "KGF", content: "Kredi/kefalet raporlari", url: "https://www.kgf.com.tr", tier: "citation", group: "resmi" },
  { code: "eximbank", name: "Eximbank", content: "Surdurulebilirlik raporlari", url: "https://www.eximbank.gov.tr", tier: "citation", group: "resmi" },
  { code: "tbb", name: "TBB", content: "Banka/sektor finansal tablo, faaliyet ve denetim raporlari", url: "https://www.tbb.org.tr", tier: "scrape", group: "resmi" },
  { code: "tusiad", name: "TUSIAD", content: "Ekonomik gorunum, risk yonetimi, girisimcilik raporlari", url: "https://tusiad.org/tr/yayinlar", tier: "citation", group: "resmi" },

  // --- 9.3 Dis veri kaynaklari (Banka Arastirma & Piyasa) ---
  { code: "ziraat", name: "Ziraat (FX / Ekonomik Ars.)", content: "Gunluk FX ve ekonomi bultenleri", url: "https://www.ziraatbank.com.tr/tr/bankamiz/arastirma-raporlari", tier: "citation", group: "banka" },
  { code: "isbank", name: "Is Bankasi", content: "Buyume, enflasyon ve veri analizi", url: "https://ekonomi.isbank.com.tr", tier: "citation", group: "banka" },
  { code: "vakifbank", name: "Vakifbank", content: "Haftalik/aylik/yillik ekonomi raporlari", url: "https://www.vakifbank.com.tr", tier: "citation", group: "banka" },
  { code: "garanti", name: "Garanti BBVA Yatirim", content: "Arastirma raporlari, gunluk bulten", url: "https://www.garantibbvayatirim.com.tr", tier: "citation", group: "banka" },
  { code: "halkbank", name: "Halkbank Yatirim", content: "Piyasa bulteni, yatirim istatistikleri", url: "https://www.halkbank.com.tr", tier: "citation", group: "banka" },
  { code: "akbank", name: "Akbank Yatirim", content: "Bankacilik ve yatirim analizleri", url: "https://yatirim.akbank.com", tier: "citation", group: "banka" },
  { code: "qnb", name: "QNB Finansbank", content: "Ekonomi bultenleri", url: "https://www.qnbfinansbank.com", tier: "citation", group: "banka" },
  { code: "denizbank", name: "DenizBank", content: "Piyasa analizleri", url: "https://www.denizbank.com", tier: "citation", group: "banka" },
  { code: "albaraka", name: "Albaraka Turk", content: "Gunluk/haftalik/aylik bultenler", url: "https://banknot.albaraka.com.tr", tier: "citation", group: "banka" },
  { code: "alternatif", name: "Alternatif Bank", content: "Ekonomik bultenler", url: "https://www.alternatifbank.com.tr", tier: "citation", group: "banka" },
  { code: "tacirler", name: "Tacirler Yatirim", content: "Ekonomik veri takvimi, dis ticaret", url: "https://www.tacirler.com.tr", tier: "citation", group: "banka" },
  { code: "eaf", name: "EAF (Koc Uni.)", content: "Ekonomik/finansal durum endeksleri", url: "https://eaf.ku.edu.tr", tier: "citation", group: "banka" },
  { code: "ipsos", name: "Ipsos Turkiye", content: "Ekonomiye dair genel bakis bultenleri", url: "https://www.ipsos.com/tr-tr", tier: "citation", group: "banka" },
  { code: "yahoo", name: "Yahoo Finance", content: "Kuresel piyasa/hisse verileri (entegrasyon)", url: "https://finance.yahoo.com", tier: "live", group: "banka" },
  { code: "fmp", name: "Financial Modeling Prep", content: "Temel analiz, oranlar, analist hedefleri", url: "https://site.financialmodelingprep.com", tier: "live", group: "banka" },
  { code: "bloomberg", name: "Bloomberg (OpenFIGI)", content: "Bloomberg FIGI / ticker kimlik eslestirme", url: "https://www.openfigi.com", tier: "live", group: "banka" },
  { code: "finnhub", name: "Finnhub", content: "Hisse fiyatlari, haber ve ekonomik takvim", url: "https://finnhub.io", tier: "live", group: "banka" },
  { code: "alphavantage", name: "Alpha Vantage", content: "Hisse/FX kotasyonlari (yedek kaynak)", url: "https://www.alphavantage.co", tier: "live", group: "banka" },
  { code: "fred", name: "FRED (St. Louis Fed)", content: "ABD faiz, enflasyon, istihdam makro serileri", url: "https://fred.stlouisfed.org", tier: "live", group: "banka" },
  { code: "gdpnow", name: "Atlanta Fed GDPNow", content: "ABD GSYIH nowcast", url: "https://www.atlantafed.org/cqer/research/gdpnow", tier: "live", group: "banka" },
  { code: "eia", name: "EIA", content: "Petrol/enerji spot fiyatlari", url: "https://www.eia.gov/opendata", tier: "live", group: "banka" },
  { code: "doviz", name: "Doviz.com", content: "Kur & emtia platformu; coklu ulke ekonomik takvim", url: "https://www.doviz.com", tier: "live", group: "banka" },
];

export const SOURCE_BY_CODE: Record<string, SourceDef> = Object.fromEntries(SOURCES.map((s) => [s.code, s]));

// "Kaynak damgasi" footer: every source as a citable line. `liveCodes` marks the
// ones that actually contributed live data in this run with a check.
export function citationList(liveCodes: Set<string> = new Set()): string {
  const line = (s: SourceDef) => `- ${liveCodes.has(s.code) ? "[veri]" : "[referans]"} ${s.name}: ${s.content} (${s.url})`;
  const resmi = SOURCES.filter((s) => s.group === "resmi").map(line).join("\n");
  const banka = SOURCES.filter((s) => s.group === "banka").map(line).join("\n");
  return `Resmi/kurumsal kaynaklar:\n${resmi}\n\nBanka arastirma & piyasa kaynaklari:\n${banka}`;
}
