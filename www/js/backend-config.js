// FieldForce 360 — backend connection.
// Leave both values empty to run the self-contained DEMO (data stays in this browser only).
// Add ?demo=1 to any page URL to force the demo for that page (used by the side-by-side demo).
// Fill them in to use the real cloud database (Supabase): Project Settings → API.
//   url     : Project URL, e.g. https://abcdxyz.supabase.co
//   anonKey : the "anon" / "publishable" key. It is safe in a web page because Row Level Security
//             in db/schema.sql decides what each signed-in user can see.
// NEVER put the service_role / secret key here.
window.FF_BACKEND = {
  url: 'https://degghwyaoityqadkevhm.supabase.co',
  anonKey: 'sb_publishable_0W6rAGxFEFM9-7vX2Cx9EA_szhtEefO'
};
