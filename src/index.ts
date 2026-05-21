import './polyfill-file.js';
import { FastMCP } from "fastmcp";
import { z } from "zod";
import { WhistleClient } from "./WhistleClient.js";
import minimist from "minimist";

// 解析命令行参数(与 `w2 start -n` / `-w` 对应:访问带账号的 Whistle 时需传相同凭据)
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
 * MCP 传输:默认 stdio;可选 http-stream(同一 HTTP 服务上提供 Streamable HTTP 与 SSE,见 FastMCP 文档)。
 * 使用独立参数 --mcp-host / --mcp-port,避免与 Whistle 的 --host / --port 混淆。
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
  description:
    "获取所有规则。返回包含 list(规则列表,每个有 name/data/selected)和 defaultRules(Default 规则文本内容)。defaultRules 是始终生效的基础规则",
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
  description: "更新规则内容（设置规则的 Whistle 语法文本）。调用后规则自动启用。更新 Default 规则用 ruleName='Default'",
  parameters: z.object({
    ruleName: z.string().describe("规则名称，Default 表示修改默认规则"),
    ruleValue: z.string().describe("新规则内容，Whistle 规则语法，如 'example.com 10.0.0.1:8080'"),
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
  description: "获取所有规则的值(注意:数据量可能很大,建议使用 getValueList 获取列表后再通过 getValue 获取具体值)",
  parameters: z.object({}),
  execute: async () => {
    const rules = await whistleClient.getAllValues();
    return formatResponse(rules);
  },
});

server.addTool({
  name: "getValueList",
  description: "获取值列表(仅包含 index 和 name,不包含 data 字段,避免数据量过大)",
  parameters: z.object({}),
  execute: async () => {
    const list = await whistleClient.getValueList();
    return formatResponse(list);
  },
});
server.addTool({
  name: "getValue",
  description: "根据名称获取单个值的完整信息(包含 data 字段)",
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
  description: "启用或禁用 Whistle 代理(通过禁用/启用所有规则实现。启用=规则生效,禁用=直通模式,不修改任何请求)",
  parameters: z.object({
    enabled: z.boolean().describe("true=代理生效,false=直通模式(禁用所有规则)"),
  }),
  execute: async (args) => {
    const result = await whistleClient.toggleProxy(args.enabled);
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
  description:
    "获取最近拦截的请求信息(不含 body,仅概览)。如需搜索特定请求并获取请求体/响应体,优先使用 searchInterceptHistory",
  parameters: z.object({
    url: z.string().optional().describe("过滤 URL,支持正则;留空返回所有"),
    startTime: z.string().optional().describe("起始时间戳(ms),默认约 1 秒前"),
    count: z.number().optional().describe("返回数量,默认 20"),
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
          // 正则表达式无效时,回退到简单的字符串包含检查
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
    "【主要搜索工具】分页搜索 Whistle 历史请求。支持 URL 关键词(不区分大小写、空格分隔多关键词全匹配)、正则、方法、客户端IP、状态码过滤。每个结果包含:url、method、statusCode、req.headers、res.headers、req._decodedBody(请求体,已解码)、res._decodedBody(响应体,已解码)、id(会话ID)。返回 sessionIds 可用于 getSessionDetail 获取更完整数据",
  parameters: z.object({
    url: z.string().optional().describe("URL 关键词(不区分大小写,空格分隔=多关键词全匹配,如 'api user login'),也支持正则表达式"),
    startTime: z.string().optional().describe("起始时间戳(ms),默认 0(查全部历史)"),
    endTime: z.string().optional().describe("结束时间戳(ms),不传则不限制"),
    lastRowId: z.string().optional().describe("分页游标,第二次查询时传上一次返回的 nextLastRowId"),
    count: z.number().optional().describe("最多返回条数,默认 100,最大 1000"),
    pageSize: z.number().optional().describe("每页读取数量,默认 100"),
    maxPages: z.number().optional().describe("最多读取页数,默认 20"),
    method: z.string().optional().describe("请求方法过滤:GET、POST 等"),
    clientIp: z.string().optional().describe("客户端 IP 过滤,用于区分手机/模拟器流量"),
    statusCode: z.number().optional().describe("响应状态码过滤:200、404、500 等"),
    redactSensitive: z.boolean().optional().describe("是否脱敏敏感头(默认 true)"),
  }),
  execute: async (args) => {
    const result = await whistleClient.searchInterceptHistory(args);
    return formatResponse(result);
  },
});

server.addTool({
  name: "replayRequest",
  description:
    "在 Whistle 中重放/构造一个 HTTP 请求。调用后不直接返回响应内容--需要用 searchInterceptHistory 搜索本次 replay 发出的请求来查看结果",
  parameters: z.object({
    url: z.string().describe("完整请求 URL,如 https://example.com/api"),
    method: z.string().optional().describe("HTTP 方法,默认 GET"),
    headers: z.string().optional().describe("请求头,格式为 'Key: Value\\r\\nKey2: Value2'"),
    body: z.string().optional().describe("请求体,JSON 字符串或普通文本"),
    useH2: z.boolean().optional().describe("是否使用 HTTP/2,默认 false"),
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
  description: "控制所有规则的启用状态(启用/禁用)",
  parameters: z.object({
    disabled: z
      .boolean()
      .describe("true表示禁用所有规则,false表示启用所有规则"),
  }),
  execute: async (args) => {
    const result = await whistleClient.disableAllRules(args.disabled);
    return formatResponse(result);
  },
});

// 新增:获取会话详情(含请求体、响应体)
server.addTool({
  name: "getSessionDetail",
  description:
    "获取请求完整详情(含请求体/响应体,已解码为 _decodedBody)。传入 searchInterceptHistory 返回的 sessionIds 即可。通常流程:searchInterceptHistory({ url: 'xxx' }) → 拿到 sessionIds → 调此方法查看完整的请求和响应内容",
  parameters: z.object({
    sessionIds: z.array(z.string()).describe("从 searchInterceptHistory 返回的 sessionIds"),
  }),
  execute: async (args) => {
    const result = await whistleClient.getSessionDetail(args.sessionIds);
    return formatResponse(result);
  },
});

// 新增:创建 Mock 规则
server.addTool({
  name: "createMock",
  description:
    "创建 Mock 规则：匹配指定 URL 的请求，返回自定义响应。内部自动创建 Whistle value（存储 mock 数据）和 rule（URL 匹配 + 响应替换）。创建后实时生效，无需重启",
  parameters: z.object({
    ruleName: z.string().describe("规则名称，仅用于标识，如 'mock_user_login'"),
    urlPattern: z.string().describe("URL 匹配模式，如 'example.com/api/user'（域名+路径）或正则"),
    statusCode: z.number().optional().describe("响应状态码，如 200/404/500，不传保持原样"),
    responseBody: z.string().describe("Mock 响应体，JSON 字符串如 '{\"code\":0,\"data\":{}}' 或 HTML 等"),
    responseHeaders: z.record(z.string(), z.string()).optional().describe("自定义响应头，如 {\\\"Content-Type\\\": \\\"application/json\\\"}"),
    delay: z.number().optional().describe("响应延迟（毫秒），用于模拟慢网络"),
    method: z.string().optional().describe("仅匹配特定 HTTP 方法，如 GET/POST"),
  }),
  execute: async (args) => {
    const result = await whistleClient.createMock(args);
    return formatResponse(result);
  },
});

// 新增：删除 Mock 规则
server.addTool({
  name: "deleteMock",
  description: "删除指定的 Mock 规则及自动创建的关联值。传入 createMock 时使用的 ruleName 即可",
  parameters: z.object({
    ruleName: z.string().describe("要删除的 Mock 规则名称（与 createMock 时的 ruleName 一致）"),
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

// 启动服务器(stdio 默认;http-stream 时由 FastMCP 监听端口,并提供 /mcp 与 /sse)
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
    console.error("Invalid --mcp-port (or FASTMCP_PORT), expected 1-65535.");
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
