import { readJson, updateJson } from "./store.js";

export interface AccountInfo {
  name: string | null;
  profile_url: string | null;
  public_id: string | null;
  first_login_at: string | null;
  last_verified_at: string | null;
}

const EMPTY: AccountInfo = { name: null, profile_url: null, public_id: null, first_login_at: null, last_verified_at: null };

/** Cached identity of the signed-in account, so status checks don't need a page load. */
export class AccountStore {
  constructor(private readonly file: string) {}

  async get(): Promise<AccountInfo> {
    return { ...EMPTY, ...(await readJson<AccountInfo>(this.file, EMPTY)) };
  }

  async update(patch: Partial<AccountInfo>): Promise<AccountInfo> {
    return updateJson<AccountInfo>(this.file, EMPTY, (current) => ({
      ...EMPTY,
      ...current,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      first_login_at: current.first_login_at ?? patch.first_login_at ?? null,
    }));
  }

  async clear(): Promise<void> {
    await updateJson<AccountInfo>(this.file, EMPTY, () => ({ ...EMPTY }));
  }
}
