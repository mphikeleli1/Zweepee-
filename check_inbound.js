const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function check() {
  const { data, error } = await supabase
    .from('system_alerts')
    .select('*')
    .eq('source', 'whapi-webhook')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }
  console.log('Last 5 Inbound Payloads:', JSON.stringify(data, null, 2));
}
check();
