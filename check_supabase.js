
import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://test.supabase.co', 'test');
console.log('from type:', typeof supabase.from);
console.log('keys:', Object.keys(supabase));
