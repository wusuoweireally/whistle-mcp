import './polyfill-file.js';
import { FastMCP } from "fastmcp";
import { z } from "zod";
import { WhistleClient } from "./WhistleClient.js";
import minimist from "minimist";

// 解析命令行参数（与 `w2 start -n` / `-w` 对应：访问带账号的 Whistle 时需传相同凭据）
const argv = minimist(process.argv.slice(2));
const host = argv.host || "localhost"; // 默认为localhost
const port = argv.port ? parseInt(argv.port) : 8899; // 默认为8899
const rawUsername = argv.n ?? argv.username;
const rawPassword = argv.w ?? argv.password;
const whistleAuth =
  rawUsername !== undefined && String(rawUsername) !== ""
    ? {
        username: String(rawUsername),
        password: rawPassword !== undefined ? String(rawPassword) : "",
      }
    : {};

/**
 * MCP 传输：默认 stdio；可选 http-stream（同一 HTTP 服务上提供 Streamable HTTP 与 SSE，见 FastMCP 文档）。
 * 使用独立参数 --mcp-host / --mcp-port，避免与 Whistle 的 --host / --port 混淆。
 */
function resolveMcpTransportMode(): "stdio" | "http-stream" {
  const raw =
    argv.transport ??
    argv.t ??
    process.env.FASTMCP_TRANSPORT ??
    "stdio";
  const s = String(raw).toLowerCase();
  if (
    s === "http-stream" ||
    s === "httpstream" ||
    s === "sse" ||
    s === "streamable-http" ||
    s === "streamablehttp"
  ) {
    return "http-stream";
  }
  if (s === "stdio" || s === "") {
    return "stdio";
  }
  console.error(
    `Unknown MCP --transport: ${String(raw)}. Use stdio (default) or http-stream (exposes Streamable HTTP + SSE).`
  );
  process.exit(1);
}

const mcpTransportMode = resolveMcpTransportMode();

// 创建FastMCP服务器
const server = new FastMCP({
  name: "Whistle MCP Service",
  version: "1.2.1",
});

// 实例化whistle客户端
const whistleClient = new WhistleClient(host, port, whistleAuth);

// 统一响应格式的包装函数
function formatResponse(data: any) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data),
      },
    ],
  };
}

// 规则管理相关工具
server.addTool({
  name: "getRules",
  description: "获取所有规则&分组",
  parameters: z.object({}),
  execute: async () => {
    const rules = await whistleClient.getRules();
    return formatResponse(rules);
  },
});

server.addTool({
  name: "createRule",
  description: "创建新规则",
  parameters: z.object({
    name: z.string().describe("规则名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.createRule(args.name);
    return formatResponse(result);
  },
});

server.addTool({
  name: "updateRule",
  description: "更新规则内容",
  parameters: z.object({
    ruleName: z.string().describe("规则名称"),
    ruleValue: z.string().describe("规则内容"),
  }),
  execute: async (args) => {
    const { ruleName, ruleValue } = args;
    const result = await whistleClient.updateRule(ruleName, ruleValue);
    return formatResponse(result);
  },
});

server.addTool({
  name: "renameRule",
  description: "重命名规则",
  parameters: z.object({
    ruleName: z.string().describe("规则现有名称"),
    newName: z.string().describe("规则的新名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.renameRule(args.ruleName, args.newName);
    return formatResponse(result);
  },
});

server.addTool({
  name: "deleteRule",
  description: "删除规则",
  parameters: z.object({
    ruleName: z.string().describe("要删除的规则名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.deleteRule(args.ruleName);
    return formatResponse(result);
  },
});

server.addTool({
  name: "enableRule",
  description: "启用规则",
  parameters: z.object({
    ruleName: z.string().describe("规则名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.selectRule(args.ruleName);
    return formatResponse(result);
  },
});

server.addTool({
  name: "disableRule",
  description: "禁用规则",
  parameters: z.object({
    ruleName: z.string().describe("规则名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.unselectRule(args.ruleName);
    return formatResponse(result);
  },
});

// 分组管理相关工具
server.addTool({
  name: "createGroup",
  description: "创建新分组",
  parameters: z.object({
    name: z.string().describe("分组名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.createGroup(args.name);
    return formatResponse(result);
  },
});

server.addTool({
  name: "renameGroup",
  description: "重命名分组",
  parameters: z.object({
    groupName: z.string().describe("分组的现有名称"),
    newName: z.string().describe("分组的新名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.renameGroup(
      args.groupName,
      args.newName
    );
    return formatResponse(result);
  },
});

server.addTool({
  name: "deleteGroup",
  description: "删除分组",
  parameters: z.object({
    groupName: z.string().describe("分组名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.deleteGroup(args.groupName);
    return formatResponse(result);
  },
});

server.addTool({
  name: "addRuleToGroup",
  description: "将规则添加到分组",
  parameters: z.object({
    groupName: z.string().describe("分组名称"),
    ruleName: z.string().describe("要添加的规则名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.moveRuleToGroup(
      args.ruleName,
      args.groupName
    );
    return formatResponse(result);
  },
});

server.addTool({
  name: "removeRuleFromGroup",
  description: "将规则移出分组",
  parameters: z.object({
    ruleName: z.string().describe("规则名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.moveRuleOutOfGroup(args.ruleName);
    return formatResponse(result);
  },
});

server.addTool({
  name: "getAllValues",
  description: "获取所有规则的值（注意：数据量可能很大，建议使用 getValueList 获取列表后再通过 getValue 获取具体值）",
  parameters: z.object({}),
  execute: async () => {
    const rules = await whistleClient.getAllValues();
    return formatResponse(rules);
  },
});

server.addTool({
  name: "getValueList",
  description: "获取值列表（仅包含 index 和 name，不包含 data 字段，避免数据量过大）",
  parameters: z.object({}),
  execute: async () => {
    const list = await whistleClient.getValueList();
    return formatResponse(list);
  },
});
server.addTool({
  name: "getValue",
  description: "根据名称获取单个值的完整信息（包含 data 字段）",
  parameters: z.object({
    name: z.string().describe("值名称"),
  }),
  execute: async (args) => {
    const value = await whistleClient.getValue(args.name);
    return formatResponse(value);
  },
});

server.addTool({
  name: "createValuesGroup",
  description: "创建新的值分组",
  parameters: z.object({
    name: z.string().describe("分组名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.createValueGroup(args.name);
    return formatResponse(result);
  },
});

server.addTool({
  name: "createValue",
  description: "创建新的值",
  parameters: z.object({
    name: z.string().describe("值名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.createValue(args.name);
    return formatResponse(result);
  },
});

server.addTool({
  name: "updateValue",
  description: "更新值内容",
  parameters: z.object({
    name: z.string().describe("值名称"),
    value: z.string().describe("新值内容"),
  }),
  execute: async (args) => {
    const result = await whistleClient.updateValue(args.name, args.value);
    return formatResponse(result);
  },
});

server.addTool({
  name: "renameValue",
  description: "重命名值",
  parameters: z.object({
    name: z.string().describe("值现有名称"),
    newName: z.string().describe("值的新名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.renameValue(args.name, args.newName);
    return formatResponse(result);
  },
});

server.addTool({
  name: "renameValueGroup",
  description: "重命名值分组",
  parameters: z.object({
    groupName: z.string().describe("分组现有名称"),
    newName: z.string().describe("分组的新名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.renameValueGroup(
      args.groupName,
      args.newName
    );
    return formatResponse(result);
  },
});

server.addTool({
  name: "deleteValue",
  description: "删除值",
  parameters: z.object({
    name: z.string().describe("值名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.deleteValue(args.name);
    return formatResponse(result);
  },
});

server.addTool({
  name: "deleteValueGroup",
  description: "删除值分组",
  parameters: z.object({
    groupName: z.string().describe("分组名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.deleteValueGroup(args.groupName);
    return formatResponse(result);
  },
});

server.addTool({
  name: "addValueToGroup",
  description: "将值添加到分组",
  parameters: z.object({
    groupName: z.string().describe("分组名称"),
    valueName: z.string().describe("要添加的值名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.moveValueToGroup(
      args.valueName,
      args.groupName
    );
    return formatResponse(result);
  },
});

server.addTool({
  name: "removeValueFromGroup",
  description: "将值移出分组",
  parameters: z.object({
    valueName: z.string().describe("值名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.moveValueOutOfGroup(args.valueName);
    return formatResponse(result);
  },
});

// 代理控制相关工具
server.addTool({
  name: "getWhistleStatus",
  description: "获取whistle服务器的当前状态",
  parameters: z.object({}),
  execute: async () => {
    const status = await whistleClient.getStatus();
    return formatResponse(status);
  },
});

server.addTool({
  name: "toggleProxy",
  description: "启用或禁用whistle代理",
  parameters: z.object({
    enabled: z.boolean().describe("是否启用代理"),
  }),
  execute: async (args) => {
    const result = await whistleClient.toggleProxy(args.enabled);
    return formatResponse(result);
  },
});

server.addTool({
  name: "toggleHttpInterception",
  description: "启用或禁用HTTP拦截",
  parameters: z.object({
    enabled: z.boolean().describe("是否启用HTTP拦截"),
  }),
  execute: async (args) => {
    const result = await whistleClient.toggleHttpsInterception(args.enabled);
    return formatResponse(result);
  },
});

server.addTool({
  name: "toggleHttpsInterception",
  description: "启用或禁用HTTPS拦截",
  parameters: z.object({
    enabled: z.boolean().describe("是否启用HTTPS拦截"),
  }),
  execute: async (args) => {
    const result = await whistleClient.toggleHttpsInterception(args.enabled);
    return formatResponse(result);
  },
});

server.addTool({
  name: "toggleHttp2",
  description: "启用或禁用HTTP/2",
  parameters: z.object({
    enabled: z.boolean().describe("是否启用HTTP/2"),
  }),
  execute: async (args) => {
    const result = await whistleClient.toggleHttp2(args.enabled);
    return formatResponse(result);
  },
});

server.addTool({
  name: "toggleMultiRuleMode",
  description: "启用或禁用多规则模式",
  parameters: z.object({
    enabled: z.boolean().describe("是否启用多规则模式"),
  }),
  execute: async (args) => {
    const result = await whistleClient.toggleMultiRuleMode(args.enabled);
    return formatResponse(result);
  },
});

// 请求拦截与重放工具
server.addTool({
  name: "getInterceptInfo",
  description: "获取URL的拦截信息(请求/响应皆以base64编码)",
  parameters: z.object({
    url: z.string().optional().describe("要检查拦截信息的URL (支持正则表达式)"),
    startTime: z.string().optional().describe("开始时间ms（可选）"),
    count: z.number().optional().describe("请求数量（可选）"),
  }),
  execute: async (args) => {
    const { url = '', startTime = (Date.now() - 1000).toString(), count } = args;
    const result = await whistleClient.getInterceptInfo({ startTime, count });
    const filteredResult = Object.values(result.data).filter((item: any) => {
      if (url) {
        try {
          const regex = new RegExp(url);
          return Array.isArray(item.url) 
            ? item.url.some((u: string) => regex.test(u)) 
            : regex.test(item.url);
        } catch (e) {
          // 正则表达式无效时，回退到简单的字符串包含检查
          return Array.isArray(item.url) 
            ? item.url.some((u: string | string[]) => u.includes(url)) 
            : item.url.includes(url);
        }
      }
      return true;
    });
    return formatResponse(filteredResult);
  },
});

server.addTool({
  name: "searchInterceptHistory",
  description:
    "分页搜索 Whistle 历史请求，支持 URL/正则、时间、方法、客户端 IP、状态码过滤；默认脱敏敏感请求头",
  parameters: z.object({
    url: z.string().optional().describe("URL 过滤条件，支持正则；正则无效时按字符串包含匹配"),
    startTime: z.string().optional().describe("开始游标/时间戳 ms，默认 0，可查询当前缓存内历史记录"),
    endTime: z.string().optional().describe("结束时间戳 ms（可选）"),
    lastRowId: z.string().optional().describe("Whistle get-data 游标（可选，高级用法）"),
    count: z.number().optional().describe("最多返回的匹配请求数，默认 100，最大 1000"),
    pageSize: z.number().optional().describe("每页读取数量，默认 100，最大 100"),
    maxPages: z.number().optional().describe("最多读取页数，默认 20，最大 200"),
    method: z.string().optional().describe("请求方法过滤，如 GET、POST"),
    clientIp: z.string().optional().describe("客户端 IP 过滤，如手机代理 IP"),
    statusCode: z.number().optional().describe("响应状态码过滤"),
    redactSensitive: z.boolean().optional().describe("是否脱敏 authorization/cookie/token 等敏感请求头，默认 true"),
  }),
  execute: async (args) => {
    const result = await whistleClient.searchInterceptHistory(args);
    return formatResponse(result);
  },
});

server.addTool({
  name: "replayRequest",
  description: "在whistle中重放捕获的请求(本接口请求后不会直接返回结果, 需要使用getInterceptInfo接口获取结果)",
  parameters: z.object({
    url: z.string().describe("请求URL"),
    method: z.string().optional().describe("请求方法，默认为GET"),
    headers: z.string().optional().describe("请求头，可以是对象或字符串"),
    body: z.string().optional().describe("请求体，可以是字符串或对象"),
    useH2: z.boolean().optional().describe("是否使用HTTP/2")
  }),
  execute: async (args) => {
    const result = await whistleClient.replayRequest(args);
    return formatResponse(result);
  },
});

/**
 * 控制所有规则的启用状态
 */
server.addTool({
  name: "setAllRulesState",
  description: "控制所有规则的启用状态（启用/禁用）",
  parameters: z.object({
    disabled: z
      .boolean()
      .describe("true表示禁用所有规则，false表示启用所有规则"),
  }),
  execute: async (args) => {
    const result = await whistleClient.disableAllRules(args.disabled);
    return formatResponse(result);
  },
});

// 新增：获取会话详情（含请求体、响应体）
server.addTool({
  name: "getSessionDetail",
  description:
    "获取指定请求的完整详情，包含请求体（reqBody）和响应体（resBody）。body 为 base64 编码，需要解码后查看。搜索到请求后调用此接口即可查看完整内容",
  parameters: z.object({
    sessionIds: z.array(z.string()).describe("会话 ID 列表，从 searchInterceptHistory 返回的 sessionIds 中获取"),
  }),
  execute: async (args) => {
    const result = await whistleClient.getSessionDetail(args.sessionIds);
    return formatResponse(result);
  },
});

// 新增：创建 Mock 规则
server.addTool({
  name: "createMock",
  description:
    "创建 Mock 规则：匹配指定 URL 的请求，返回自定义的响应内容。会在 Whistle 中创建一条规则和一个对应的值",
  parameters: z.object({
    ruleName: z.string().describe("规则名称，例如 'mock_user_api'"),
    urlPattern: z.string().describe("URL 匹配模式，例如 'example.com/api/user' 或正则 '/api/user\\d+' 等"),
    statusCode: z.number().optional().describe("响应状态码，例如 200、404、500。不传则保持原状"),
    responseBody: z.string().describe("mock 的响应体内容，JSON 字符串、HTML 等"),
    responseHeaders: z.record(z.string(), z.string()).optional().describe("自定义响应头，例如 { 'Content-Type': 'application/json' }"),
    delay: z.number().optional().describe("延迟响应时间（毫秒）"),
    method: z.string().optional().describe("仅匹配特定请求方法，如 GET、POST"),
  }),
  execute: async (args) => {
    const result = await whistleClient.createMock(args);
    return formatResponse(result);
  },
});

// 新增：删除 Mock 规则
server.addTool({
  name: "deleteMock",
  description: "删除指定的 Mock 规则及其关联的值",
  parameters: z.object({
    ruleName: z.string().describe("要删除的 Mock 规则名称"),
  }),
  execute: async (args) => {
    const result = await whistleClient.deleteMock(args.ruleName);
    return formatResponse(result);
  },
});

/**
 * 返回当前本地的时间戳
 */
server.addTool({
  name: "getCurrentTimestamp",
  description: "获取当前本地时间戳",
  parameters: z.object({}),
  execute: async () => {
    const timestamp = Date.now();
    return formatResponse({ timestamp });
  },
});

// 启动服务器（stdio 默认；http-stream 时由 FastMCP 监听端口，并提供 /mcp 与 /sse）
async function startMcpServer() {
  if (mcpTransportMode === "stdio") {
    await server.start({ transportType: "stdio" });
    return;
  }

  const mcpPortRaw =
    argv["mcp-port"] ??
    argv.mcpPort ??
    process.env.FASTMCP_PORT;
  const mcpHost =
    argv["mcp-host"] ??
    argv.mcpHost ??
    process.env.FASTMCP_HOST ??
    "0.0.0.0";
  const mcpEndpointRaw =
    argv["mcp-endpoint"] ??
    argv.mcpEndpoint ??
    process.env.FASTMCP_ENDPOINT ??
    "/mcp";
  const statelessRaw =
    argv.stateless ?? process.env.FASTMCP_STATELESS;
  const stateless =
    statelessRaw === true ||
    statelessRaw === "true" ||
    statelessRaw === 1;

  const httpPort =
    mcpPortRaw !== undefined
      ? parseInt(String(mcpPortRaw), 10)
      : 8085;
  if (Number.isNaN(httpPort) || httpPort < 1 || httpPort > 65535) {
    console.error("Invalid --mcp-port (or FASTMCP_PORT), expected 1–65535.");
    process.exit(1);
  }

  let endpoint = String(mcpEndpointRaw);
  if (!endpoint.startsWith("/")) {
    endpoint = `/${endpoint}`;
  }

  await server.start({
    transportType: "httpStream",
    httpStream: {
      host: String(mcpHost),
      port: httpPort,
      endpoint: endpoint as `/${string}`,
      stateless,
    },
  });

  const base = `http://${mcpHost}:${httpPort}`;
  console.error(
    `[whistle-mcp] MCP HTTP: Streamable HTTP ${base}${endpoint}, SSE ${base}/sse`
  );
}

void startMcpServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
