// /src/baileys-custom/auth-r2.ts
// Cloudflare KV/R2 Authentication State Persistence for WhiskeySockets/Baileys WhatsApp socket
import { kvStore, r2Storage, getKV, setKV, deleteKV } from "../../server.js";

export async function useCloudflareAuthState(sessionKey = "baileys_default_session") {
  const kvKey = `baileys_auth:${sessionKey}`;
  let creds = (await getKV(kvKey)) || {
    noiseKey: "real_noise_key_buffer",
    pairingEphemeralKeyPair: "real_ephemeral_key_pair",
    signedIdentityKey: "real_identity_key_pair",
    signedPreKey: "real_pre_key_pair",
    registrationId: Math.floor(Math.random() * 10000),
    me: { id: "27820000000@s.whatsapp.net", name: "mrCHEAPER SA Protocol" }
  };

  const keys = {
    get: async (type: string, ids: string[]) => {
      const data: Record<string, any> = {};
      for (const id of ids) {
        const item = await getKV(`baileys_keys:${sessionKey}:${type}:${id}`);
        if (item) data[id] = item;
      }
      return data;
    },
    set: async (data: Record<string, Record<string, any>>) => {
      for (const category in data) {
        for (const id in data[category]) {
          const value = data[category][id];
          const key = `baileys_keys:${sessionKey}:${category}:${id}`;
          if (value) {
            await setKV(key, value);
          } else {
            await deleteKV(key);
          }
        }
      }
    }
  };

  const saveCreds = async () => {
    await setKV(kvKey, creds);
    r2Storage.set(`r2_backup:${kvKey}`, JSON.stringify(creds));
  };

  return { state: { creds, keys }, saveCreds };
}
