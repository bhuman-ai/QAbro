import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const TEMPLATE_PATH = path.join(PROJECT_ROOT, "supabase", "templates", "magic-link-swarmtester.html");
const PROJECT_REF_PATH = path.join(PROJECT_ROOT, "supabase", ".temp", "project-ref");
const DEFAULT_SUBJECT = "Sign in to SwarmTester";

function readProjectRef() {
  const fromEnv = String(process.env.SUPABASE_PROJECT_REF || "").trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (fs.existsSync(PROJECT_REF_PATH)) {
    return String(fs.readFileSync(PROJECT_REF_PATH, "utf8")).trim();
  }
  return "";
}

async function main() {
  const accessToken = String(process.env.SUPABASE_ACCESS_TOKEN || "").trim();
  const projectRef = readProjectRef();

  if (!accessToken) {
    throw new Error("SUPABASE_ACCESS_TOKEN is required.");
  }
  if (!projectRef) {
    throw new Error("SUPABASE_PROJECT_REF is required or supabase/.temp/project-ref must exist.");
  }
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Missing template: ${TEMPLATE_PATH}`);
  }

  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      mailer_subjects_magic_link: DEFAULT_SUBJECT,
      mailer_templates_magic_link_content: template
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Supabase API request failed with ${response.status}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        project_ref: projectRef,
        mailer_subjects_magic_link: payload.mailer_subjects_magic_link,
        template_length: String(payload.mailer_templates_magic_link_content || "").length
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
