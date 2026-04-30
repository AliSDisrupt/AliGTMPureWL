import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import DashboardControls from "../components/DashboardControls";

type SourceBreakdown = {
  source: string;
  spend: string;
  impressions: string;
  clicks: string;
  leads?: string;
};

type MetricSet = {
  spend: number;
  clicks: number;
  leads: number;
};
const EXCLUDED_ANALYSIS_SOURCES = new Set(["lemlist", "hubspot"]);
type PresetValue = "today" | "yesterday" | "7d" | "30d" | "90d" | "mtd";
type SearchParams = {
  startDate?: string;
  endDate?: string;
  preset?: string;
};

async function fetchJson<T>(path: string): Promise<T> {
  const baseUrl = process.env.API_BASE_URL ?? "http://localhost:4000";
  const response = await fetch(`${baseUrl}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json() as Promise<T>;
}

function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, delta: number): Date {
  return new Date(date.getTime() + delta * 86400000);
}

function toNumeric(value: string | number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatSourceName(source: string): string {
  const mapping: Record<string, string> = {
    google_ads: "Google Ads",
    reddit_ads: "Reddit Ads",
    linkedin_forms: "LinkedIn Ads",
    hubspot: "HubSpot",
    ga4: "Google Analytics 4",
    lemlist: "Lemlist"
  };
  return mapping[source] ?? source.replaceAll("_", " ");
}

function percentDelta(current: number, previous: number): string {
  if (previous === 0 && current === 0) return "0.0%";
  if (previous === 0) return "+100.0%";
  const delta = ((current - previous) / previous) * 100;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

function countDelta(current: number, previous: number): string {
  const delta = current - previous;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toLocaleString()}`;
}

function combinedDelta(current: number, previous: number): string {
  return `${countDelta(current, previous)} (${percentDelta(current, previous)})`;
}

function combinedCurrencyDelta(current: number, previous: number): string {
  const delta = current - previous;
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(delta).toFixed(2)} (${percentDelta(current, previous)})`;
}

function deltaClassName(current: number, previous: number): string {
  const delta = current - previous;
  if (delta > 0) {
    return "delta-positive";
  }
  if (delta < 0) {
    return "delta-negative";
  }
  return "delta-neutral";
}

function deltaArrow(current: number, previous: number): string {
  const delta = current - previous;
  if (delta > 0) {
    return "↑";
  }
  if (delta < 0) {
    return "↓";
  }
  return "→";
}

function buildSourceMap(rows: SourceBreakdown[]): Map<string, MetricSet> {
  const map = new Map<string, MetricSet>();
  for (const row of rows) {
    if (EXCLUDED_ANALYSIS_SOURCES.has(row.source)) {
      continue;
    }
    map.set(row.source, {
      spend: toNumeric(row.spend),
      clicks: toNumeric(row.clicks),
      leads: toNumeric(row.leads)
    });
  }
  return map;
}

function getDateRange(searchParams?: SearchParams): { startDate: string; endDate: string; preset: string } {
  const today = new Date();
  const preset = searchParams?.preset ?? "7d";
  let start = new Date(today.getTime() - 6 * 86400000);
  let end = new Date(today);

  if (preset === "today") {
    start = new Date(today);
    end = new Date(today);
  } else if (preset === "yesterday") {
    start = new Date(today.getTime() - 86400000);
    end = new Date(today.getTime() - 86400000);
  } else if (preset === "30d") {
    start = new Date(today.getTime() - 29 * 86400000);
  } else if (preset === "90d") {
    start = new Date(today.getTime() - 89 * 86400000);
  } else if (preset === "mtd") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  }

  return {
    preset,
    startDate: searchParams?.startDate ?? toDateString(start),
    endDate: searchParams?.endDate ?? toDateString(end)
  };
}

function getDaySpan(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diffMs = end.getTime() - start.getTime();
  const days = Math.floor(diffMs / 86400000) + 1;
  return Math.max(days, 1);
}

export default async function AnalysisPage({ searchParams }: { searchParams?: SearchParams }) {
  const cookieStore = cookies();
  const authUser = cookieStore.get("purewl_auth")?.value;
  if (!authUser) {
    redirect("/login");
  }

  const authEmail = cookieStore.get("purewl_auth_email")?.value ?? (authUser.includes("@") ? authUser : "admin@purewl.com");
  const fallbackName = authEmail
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
  const authName = cookieStore.get("purewl_auth_name")?.value ?? fallbackName;
  const emailHash = createHash("md5").update(authEmail.trim().toLowerCase()).digest("hex");
  const authPicture =
    cookieStore.get("purewl_auth_picture")?.value ?? `https://www.gravatar.com/avatar/${emailHash}?d=identicon&s=80`;

  const { startDate, endDate, preset } = getDateRange(searchParams);
  const selectedStart = new Date(`${startDate}T00:00:00`);
  const selectedEnd = new Date(`${endDate}T00:00:00`);
  const spanDays = getDaySpan(startDate, endDate);
  const previousStart = addDays(selectedStart, -spanDays);
  const previousEnd = addDays(selectedEnd, -spanDays);
  const monthShiftStart = addDays(selectedStart, -30);
  const monthShiftEnd = addDays(selectedEnd, -30);
  const yearShiftStart = addDays(selectedStart, -365);
  const yearShiftEnd = addDays(selectedEnd, -365);

  const [currentWeekRows, previousWeekRows, monthShiftRows, yearShiftRows] = await Promise.all([
    fetchJson<SourceBreakdown[]>(`/channels/breakdown?startDate=${startDate}&endDate=${endDate}`),
    fetchJson<SourceBreakdown[]>(`/channels/breakdown?startDate=${toDateString(previousStart)}&endDate=${toDateString(previousEnd)}`),
    fetchJson<SourceBreakdown[]>(`/channels/breakdown?startDate=${toDateString(monthShiftStart)}&endDate=${toDateString(monthShiftEnd)}`),
    fetchJson<SourceBreakdown[]>(`/channels/breakdown?startDate=${toDateString(yearShiftStart)}&endDate=${toDateString(yearShiftEnd)}`)
  ]);

  const currentMap = buildSourceMap(currentWeekRows);
  const previousMap = buildSourceMap(previousWeekRows);
  const monthMap = buildSourceMap(monthShiftRows);
  const yearMap = buildSourceMap(yearShiftRows);

  const allSources = Array.from(new Set([...currentMap.keys(), ...previousMap.keys(), ...monthMap.keys(), ...yearMap.keys()])).sort();
  const totalCurrent = Array.from(currentMap.values()).reduce(
    (acc, row) => ({ spend: acc.spend + row.spend, clicks: acc.clicks + row.clicks, leads: acc.leads + row.leads }),
    { spend: 0, clicks: 0, leads: 0 }
  );
  const totalPrevious = Array.from(previousMap.values()).reduce(
    (acc, row) => ({ spend: acc.spend + row.spend, clicks: acc.clicks + row.clicks, leads: acc.leads + row.leads }),
    { spend: 0, clicks: 0, leads: 0 }
  );
  const totalMonth = Array.from(monthMap.values()).reduce(
    (acc, row) => ({ spend: acc.spend + row.spend, clicks: acc.clicks + row.clicks, leads: acc.leads + row.leads }),
    { spend: 0, clicks: 0, leads: 0 }
  );
  const totalYear = Array.from(yearMap.values()).reduce(
    (acc, row) => ({ spend: acc.spend + row.spend, clicks: acc.clicks + row.clicks, leads: acc.leads + row.leads }),
    { spend: 0, clicks: 0, leads: 0 }
  );

  return (
    <main className="wireframeRoot">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-badge">PureWL GTM</div>
        </div>
        <div className="sidebar-section-label">Overview</div>
        <a href="/" className="nav-item"><span className="nav-dot">⌂</span>Home</a>
        <a href="/analysis" className="nav-item active"><span className="nav-dot">A</span>Analysis</a>
        <div className="sidebar-footer">
          <div className="sidebar-avatar">
            {authPicture ? <img src={authPicture} alt={authName} className="sidebar-avatar-img" /> : "U"}
          </div>
          <div className="sidebar-user">
            <div className="sidebar-name">{authName}</div>
            <div className="sidebar-email">{authEmail}</div>
          </div>
          <a href="/api/auth/logout" className="sidebar-power" title="Logout">⏻</a>
        </div>
      </aside>

      <div className="mainPanel">
        <header className="topbar">
          <div className="topbar-title">Analysis</div>
          <DashboardControls startDate={startDate} endDate={endDate} preset={preset} />
        </header>
        <div className="content">
          <section className="section-heading"><span className="platform-badge">All Sources</span>Comparative Analysis</section>

          <section className="kpi-grid">
            <div className="kpi-card"><div className="kpi-label">Selected Spend</div><div className="kpi-value">${totalCurrent.spend.toFixed(2)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Selected Clicks</div><div className="kpi-value">{totalCurrent.clicks.toLocaleString()}</div></div>
            <div className="kpi-card"><div className="kpi-label">Selected Leads</div><div className="kpi-value">{totalCurrent.leads.toLocaleString()}</div></div>
            <div className="kpi-card"><div className="kpi-label">Spend WoW</div><div className={`kpi-value ${deltaClassName(totalCurrent.spend, totalPrevious.spend)}`}>{deltaArrow(totalCurrent.spend, totalPrevious.spend)} {combinedCurrencyDelta(totalCurrent.spend, totalPrevious.spend)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Spend Last Month</div><div className={`kpi-value ${deltaClassName(totalCurrent.spend, totalMonth.spend)}`}>{deltaArrow(totalCurrent.spend, totalMonth.spend)} {combinedCurrencyDelta(totalCurrent.spend, totalMonth.spend)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Spend Last Year</div><div className={`kpi-value ${deltaClassName(totalCurrent.spend, totalYear.spend)}`}>{deltaArrow(totalCurrent.spend, totalYear.spend)} {combinedCurrencyDelta(totalCurrent.spend, totalYear.spend)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Clicks WoW</div><div className={`kpi-value ${deltaClassName(totalCurrent.clicks, totalPrevious.clicks)}`}>{deltaArrow(totalCurrent.clicks, totalPrevious.clicks)} {combinedDelta(totalCurrent.clicks, totalPrevious.clicks)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Clicks Last Month</div><div className={`kpi-value ${deltaClassName(totalCurrent.clicks, totalMonth.clicks)}`}>{deltaArrow(totalCurrent.clicks, totalMonth.clicks)} {combinedDelta(totalCurrent.clicks, totalMonth.clicks)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Clicks Last Year</div><div className={`kpi-value ${deltaClassName(totalCurrent.clicks, totalYear.clicks)}`}>{deltaArrow(totalCurrent.clicks, totalYear.clicks)} {combinedDelta(totalCurrent.clicks, totalYear.clicks)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Leads WoW</div><div className={`kpi-value ${deltaClassName(totalCurrent.leads, totalPrevious.leads)}`}>{deltaArrow(totalCurrent.leads, totalPrevious.leads)} {combinedDelta(totalCurrent.leads, totalPrevious.leads)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Leads Last Month</div><div className={`kpi-value ${deltaClassName(totalCurrent.leads, totalMonth.leads)}`}>{deltaArrow(totalCurrent.leads, totalMonth.leads)} {combinedDelta(totalCurrent.leads, totalMonth.leads)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Leads Last Year</div><div className={`kpi-value ${deltaClassName(totalCurrent.leads, totalYear.leads)}`}>{deltaArrow(totalCurrent.leads, totalYear.leads)} {combinedDelta(totalCurrent.leads, totalYear.leads)}</div></div>
          </section>

          <section className="sketch-card">
            <table className="sketch-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Week Spend</th>
                  <th>Week Clicks</th>
                  <th>Week Leads</th>
                  <th>Spend WoW</th>
                  <th>Spend Last Month</th>
                  <th>Spend Last Year</th>
                  <th>Clicks WoW</th>
                  <th>Clicks Last Month</th>
                  <th>Clicks Last Year</th>
                  <th>Leads WoW</th>
                  <th>Leads Last Month</th>
                  <th>Leads Last Year</th>
                </tr>
              </thead>
              <tbody>
                {allSources.map((source) => {
                  const current = currentMap.get(source) ?? { spend: 0, clicks: 0, leads: 0 };
                  const previous = previousMap.get(source) ?? { spend: 0, clicks: 0, leads: 0 };
                  const month = monthMap.get(source) ?? { spend: 0, clicks: 0, leads: 0 };
                  const year = yearMap.get(source) ?? { spend: 0, clicks: 0, leads: 0 };
                  return (
                    <tr key={source}>
                      <td>{formatSourceName(source)}</td>
                      <td>${current.spend.toFixed(2)}</td>
                      <td>{current.clicks.toLocaleString()}</td>
                      <td>{current.leads.toLocaleString()}</td>
                      <td className={deltaClassName(current.spend, previous.spend)}>{deltaArrow(current.spend, previous.spend)} {combinedCurrencyDelta(current.spend, previous.spend)}</td>
                      <td className={deltaClassName(current.spend, month.spend)}>{deltaArrow(current.spend, month.spend)} {combinedCurrencyDelta(current.spend, month.spend)}</td>
                      <td className={deltaClassName(current.spend, year.spend)}>{deltaArrow(current.spend, year.spend)} {combinedCurrencyDelta(current.spend, year.spend)}</td>
                      <td className={deltaClassName(current.clicks, previous.clicks)}>{deltaArrow(current.clicks, previous.clicks)} {combinedDelta(current.clicks, previous.clicks)}</td>
                      <td className={deltaClassName(current.clicks, month.clicks)}>{deltaArrow(current.clicks, month.clicks)} {combinedDelta(current.clicks, month.clicks)}</td>
                      <td className={deltaClassName(current.clicks, year.clicks)}>{deltaArrow(current.clicks, year.clicks)} {combinedDelta(current.clicks, year.clicks)}</td>
                      <td className={deltaClassName(current.leads, previous.leads)}>{deltaArrow(current.leads, previous.leads)} {combinedDelta(current.leads, previous.leads)}</td>
                      <td className={deltaClassName(current.leads, month.leads)}>{deltaArrow(current.leads, month.leads)} {combinedDelta(current.leads, month.leads)}</td>
                      <td className={deltaClassName(current.leads, year.leads)}>{deltaArrow(current.leads, year.leads)} {combinedDelta(current.leads, year.leads)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </main>
  );
}
