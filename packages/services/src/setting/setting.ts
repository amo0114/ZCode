import type { AppSettings } from "@zcode/shared";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

export interface ISettingService {
  get(): Promise<AppSettings>;
  update(patch: Partial<AppSettings>): Promise<void>;
  /** Change the data base directory: copy data from old → new location, then persist the setting. */
  updateDataBaseDir(newDir: string | undefined): Promise<void>;
  ensureDefaultProject(homedir: string): Promise<{ path: string; created: boolean }>;
  /**
   * 读取用户自定义指令（个性化）文件 `~/.zcode/AGENTS.md`。
   * 文件缺失时返回空 content；filePath 用于排查与 Agent 实际读取路径是否一致。
   */
  getUserInstructions(): Promise<{ content: string; filePath: string }>;
  /** 原子写入用户自定义指令（个性化）文件，按需创建 `~/.zcode` 目录。 */
  saveUserInstructions(content: string): Promise<{ filePath: string }>;
}

export const ISettingService = createServiceDescriptor<ISettingService>(ServiceChannels.Setting);
