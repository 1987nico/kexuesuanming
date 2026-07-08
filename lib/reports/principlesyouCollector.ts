const BASE_URL = "https://principlesyou.com";

function decodeHtmlAttr(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

class CookieJar {
  private cookies = new Map<string, string>();

  addFrom(headers: Headers) {
    const withGetSetCookie = headers as unknown as { getSetCookie?: () => string[] };
    const setCookies = withGetSetCookie.getSetCookie?.() ?? [];
    const fallback = setCookies.length ? [] : [headers.get("set-cookie")].filter(Boolean);
    for (const line of [...setCookies, ...fallback]) {
      if (!line) continue;
      const [pair] = line.split(";");
      const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }

  header() {
    return Array.from(this.cookies, ([key, value]) => `${key}=${value}`).join("; ");
  }
}

async function request(jar: CookieJar, url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  const cookie = jar.header();
  if (cookie) headers.set("Cookie", cookie);
  headers.set("User-Agent", "Mozilla/5.0 authorized-research");
  headers.set("Accept", headers.get("Accept") || "application/json,text/html;q=0.9,*/*;q=0.8");
  const response = await fetch(url, { ...options, headers, redirect: "follow" });
  jar.addFrom(response.headers);
  return response;
}

function parseHome(html: string) {
  const csrf = html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1];
  const propsAttr = html.match(/data-react-class="src\/Home\/Home" data-react-props="([^"]+)"/)?.[1];
  if (!csrf || !propsAttr) throw new Error("Could not parse CSRF token or Home props");
  return { csrf, props: JSON.parse(decodeHtmlAttr(propsAttr)) };
}

export interface PrinciplesYouSession {
  jar: CookieJar;
  csrf: string;
  questionsPath: string;
  userId?: string | number;
  userAssessmentId?: string | number;
}

export interface PrinciplesYouAnswer {
  question_number: number;
  answer_number: number;
}

export async function createSession(): Promise<PrinciplesYouSession> {
  const jar = new CookieJar();
  const home = await request(jar, `${BASE_URL}/home`, { headers: { Accept: "text/html" } });
  if (!home.ok) throw new Error(`GET home failed: ${home.status}`);
  const html = await home.text();
  const { csrf, props } = parseHome(html);
  return {
    jar,
    csrf,
    questionsPath: props.questions_path,
    userId: props.user_id,
    userAssessmentId: props.user_assessment?.id,
  };
}

export async function getQuestions(session: PrinciplesYouSession) {
  const response = await request(session.jar, `${BASE_URL}${session.questionsPath}`);
  if (!response.ok) throw new Error(`GET questions failed: ${response.status}`);
  return response.json();
}

export async function postAnswers(session: PrinciplesYouSession, answers: PrinciplesYouAnswer[]) {
  const response = await request(session.jar, `${BASE_URL}${session.questionsPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": session.csrf,
    },
    body: JSON.stringify({ answers, page_time: 1000 }),
  });
  if (!response.ok) throw new Error(`POST questions failed: ${response.status} ${await response.text()}`);
  return response.json();
}

export async function score(session: PrinciplesYouSession) {
  await request(session.jar, `${BASE_URL}/score_user`);
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await request(session.jar, `${BASE_URL}/full_results_json`);
    if (response.status === 200) return response.json();
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Timed out waiting for full_results_json");
}
