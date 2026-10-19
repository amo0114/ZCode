export const CODING_PLAN_TEAM_MOCK_BASE_URL_ENV = "ZCODE_CODING_PLAN_TEAM_MOCK_BASE_URL";

type MutableEnvironment = Record<string, string | undefined>;

const CODING_PLAN_COMMON_ENV_KEYS = [
  "ZCODE_BASE_URL",
  "ZCODE_ENDPOINT_ORIGIN",
  "ZCODE_TEST_BASE_URL",
  "BIGMODEL_API_BASE_URL",
  "ZCODE_E2E_CODING_PLAN_MOCK_URL",
] as const;

const DEFAULT_FULL_E2E_SPEC_GLOB = "./test/e2e/**/*.test.ts";
const CODING_PLAN_TEAM_SPEC_MARKERS = [
  // 创建埋点回归复用本地账号控制面，避免初始化/发送访问真实套餐与登录服务。
  "conversation-session-create-telemetry.test.ts",
  "conversation-session-automation-run-title-stable.test.ts",
  // Bug 原因：连续切模回放也播种了模拟登录态；未隔离控制面时，线上 401
  // 会触发登录过期弹窗，遮住第二轮的模型菜单，导致与切模无关的失败。
  "conversation-session-active-model-context.test.ts",
] as const;

export function shouldPrepareCodingPlanTeamMock(specs: readonly string[]) {
  return specs.some((spec) => {
    const normalized = spec.replaceAll("\\", "/");
    return (
      normalized === DEFAULT_FULL_E2E_SPEC_GLOB ||
      CODING_PLAN_TEAM_SPEC_MARKERS.some((marker) => normalized.includes(marker))
    );
  });
}

export function applyCodingPlanTeamMockEnv(environment: MutableEnvironment, baseUrl: string) {
  environment[CODING_PLAN_TEAM_MOCK_BASE_URL_ENV] = baseUrl;
  environment.ZCODE_ENV = "test";
  for (const key of CODING_PLAN_COMMON_ENV_KEYS) {
    environment[key] = baseUrl;
  }
  environment.ZCODE_BIGMODEL_USAGE_QUOTA_URL = `${baseUrl}/api/monitor/usage/quota/limit`;
  environment.BIGMODEL_USAGE_QUOTA_URL = `${baseUrl}/api/monitor/usage/quota/limit`;
}

export function clearCodingPlanTeamMockEnv(environment: MutableEnvironment, baseUrl: string) {
  clearOwnedEnvironmentValues(environment, baseUrl, [
    ...CODING_PLAN_COMMON_ENV_KEYS,
    "ZCODE_BIGMODEL_USAGE_QUOTA_URL",
    "BIGMODEL_USAGE_QUOTA_URL",
  ]);
  if (environment[CODING_PLAN_TEAM_MOCK_BASE_URL_ENV] === baseUrl) {
    delete environment[CODING_PLAN_TEAM_MOCK_BASE_URL_ENV];
  }
}

function clearOwnedEnvironmentValues(
  environment: MutableEnvironment,
  baseUrl: string,
  keys: readonly string[],
) {
  const ownedValues = new Set([baseUrl, `${baseUrl}/api/monitor/usage/quota/limit`]);
  for (const key of keys) {
    if (ownedValues.has(environment[key] ?? "")) {
      delete environment[key];
    }
  }
}
