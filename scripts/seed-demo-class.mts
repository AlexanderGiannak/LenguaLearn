// Creates a demo teacher and a class of 25 students who trained over the past week, through
// the admin API. Local development and PR previews only; production refuses it.
//   npm run seed:demo-class                 # http://localhost:3000
//   npm run seed:demo-class -- <preview URL>
const baseUrl = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const token = process.env.ADMIN_API_TOKEN;
if (!token) {
  console.error("ADMIN_API_TOKEN is not set. Run `npm run admin:token` to make one.");
  process.exit(1);
}
const res = await fetch(`${baseUrl}/api/admin/accounts`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ action: "seed_demo_class" }),
});
const body = (await res.json()) as Record<string, string>;
if (!res.ok) {
  console.error(`Failed (${res.status}):`, body.error);
  process.exit(1);
}
console.log(`Demo class ready. Sign in at ${baseUrl}/sign-in with:`);
console.log(`  email:    ${body.teacherEmail}`);
console.log(`  password: ${body.teacherPassword}`);
