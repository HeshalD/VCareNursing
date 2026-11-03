// SQL (run by migrate.js) that keeps honorifics canonical in the database itself:
//   canonical_honorific(text)  -> 'Mr.' / 'Mrs.' / 'Miss' / 'Ms.' / 'Dr.' / 'Prof.' / 'Rev.', or NULL if unknown
//   trigger on every table with an honorific column: auto-corrects variants (Mr -> Mr., Doc -> Dr.)
//   and rejects anything it does not recognise.
// Mirrors utils/honorific.js. A row whose honorific is not being changed is left alone, so a legacy
// value never blocks an unrelated update.
const TABLES = ['client_profiles', 'service_requests', 'pending_registrations'];

const statements = [
  `CREATE OR REPLACE FUNCTION canonical_honorific(h text) RETURNS text AS $fn$
     SELECT CASE lower(regexp_replace(btrim(h), '\\.+$', ''))
       WHEN 'mr' THEN 'Mr.'
       WHEN 'mrs' THEN 'Mrs.'
       WHEN 'miss' THEN 'Miss'
       WHEN 'ms' THEN 'Ms.'
       WHEN 'dr' THEN 'Dr.' WHEN 'doc' THEN 'Dr.' WHEN 'doctor' THEN 'Dr.'
       WHEN 'prof' THEN 'Prof.' WHEN 'professor' THEN 'Prof.'
       WHEN 'rev' THEN 'Rev.' WHEN 'reverend' THEN 'Rev.'
       ELSE NULL END
   $fn$ LANGUAGE sql IMMUTABLE`,

  `CREATE OR REPLACE FUNCTION enforce_canonical_honorific() RETURNS trigger AS $fn$
   DECLARE c text;
   BEGIN
     IF NEW.honorific IS NULL OR btrim(NEW.honorific) = '' THEN
       NEW.honorific := NULL;
       RETURN NEW;
     END IF;
     IF TG_OP = 'UPDATE' AND NEW.honorific IS NOT DISTINCT FROM OLD.honorific THEN
       RETURN NEW;
     END IF;
     c := canonical_honorific(NEW.honorific);
     IF c IS NULL THEN
       RAISE EXCEPTION 'Invalid honorific "%": use Mr., Mrs., Miss, Ms., Dr., Prof. or Rev.', NEW.honorific
         USING ERRCODE = '22023';
     END IF;
     NEW.honorific := c;
     RETURN NEW;
   END;
   $fn$ LANGUAGE plpgsql`,

  // One-off clean-up of existing rows (idempotent): Mr -> Mr., Doc -> Dr., ...
  ...TABLES.map((t) => `UPDATE ${t} SET honorific = canonical_honorific(honorific)
     WHERE honorific IS NOT NULL AND canonical_honorific(honorific) IS NOT NULL AND canonical_honorific(honorific) <> honorific`),

  ...TABLES.flatMap((t) => [
    `DROP TRIGGER IF EXISTS trg_canonical_honorific ON ${t}`,
    `CREATE TRIGGER trg_canonical_honorific BEFORE INSERT OR UPDATE OF honorific ON ${t}
       FOR EACH ROW EXECUTE FUNCTION enforce_canonical_honorific()`,
  ]),
];

module.exports = { statements, TABLES };
