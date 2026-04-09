/**
 * @fileoverview ToolRegistry — central registry for agent tools.
 * Inspired by pi-agent-core's tool management.
 *
 * Responsibilities:
 * - Register/unregister tools by name
 * - Validate tool definitions (name, description, parameters schema, execute function)
 * - Find tools by name (case-insensitive)
 * - List all registered tools (metadata only, no execute functions)
 * - Validate tool arguments against JSON Schema parameters
 *
 * This module is SELF-CONTAINED — no dependencies on main.js or other electron modules.
 *
 * @module agent/tool-registry
 */

const Ajv = require('ajv');

// Singleton Ajv instance for schema validation
const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * Validate that a tool definition has the required fields and correct types.
 * @param {import('./types').AgentTool} tool
 * @returns {{valid: boolean, errors?: string[]}}
 */
function validateToolDefinition(tool) {
  const errors = [];

  if (!tool || typeof tool !== 'object') {
    return { valid: false, errors: ['Tool must be an object'] };
  }

  // Required fields
  if (typeof tool.name !== 'string' || tool.name.trim().length === 0) {
    errors.push('Tool must have a non-empty string "name"');
  }

  if (typeof tool.label !== 'string' || tool.label.trim().length === 0) {
    errors.push('Tool must have a non-empty string "label"');
  }

  if (typeof tool.description !== 'string' || tool.description.trim().length === 0) {
    errors.push('Tool must have a non-empty string "description"');
  }

  if (typeof tool.parameters !== 'object' || tool.parameters === null) {
    errors.push('Tool must have an object "parameters" (JSON Schema)');
  }

  if (typeof tool.execute !== 'function') {
    errors.push('Tool must have a function "execute"');
  }

  // Name validation: lowercase, no spaces
  if (tool.name && !/^[a-z0-9_]+$/.test(tool.name)) {
    errors.push('Tool name must be lowercase alphanumeric with underscores only');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

/**
 * Validate tool arguments against the tool's JSON Schema parameters.
 * @param {import('./types').AgentTool} tool
 * @param {Object} args
 * @returns {{valid: boolean, errors?: string[]}}
 */
function validateToolArguments(tool, args) {
  if (!tool.parameters || typeof tool.parameters !== 'object') {
    return { valid: false, errors: ['Tool has no parameters schema'] };
  }

  try {
    const validate = ajv.compile(tool.parameters);
    const valid = validate(args);
    if (!valid) {
      const errors = (validate.errors || []).map(
        (e) => `${e.instancePath || 'root'}: ${e.message}`
      );
      return { valid: false, errors };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, errors: [`Schema compilation error: ${err.message}`] };
  }
}

/**
 * ToolRegistry class — manages a collection of AgentTools.
 * Thread-safe: all operations are synchronous and deterministic.
 */
class ToolRegistry {
  /**
   * @param {Object} [options]
   * @param {import('./types').AgentTool[]} [options.tools] - Initial tools to register
   */
  constructor(options = {}) {
    /** @type {Map<string, import('./types').AgentTool>} */
    this._tools = new Map();

    // Register initial tools if provided
    const initialTools = options.tools || [];
    for (const tool of initialTools) {
      this.register(tool);
    }
  }

  /**
   * Register a tool. Throws if validation fails.
   * If a tool with the same name exists, it is replaced.
   * @param {import('./types').AgentTool} tool
   * @returns {this}
   */
  register(tool) {
    const validation = validateToolDefinition(tool);
    if (!validation.valid) {
      throw new Error(
        `Invalid tool definition "${tool?.name || 'unknown'}": ${validation.errors.join(', ')}`
      );
    }

    const name = tool.name.toLowerCase();
    this._tools.set(name, tool);
    return this;
  }

  /**
   * Unregister a tool by name.
   * @param {string} name
   * @returns {boolean} True if tool was found and removed
   */
  unregister(name) {
    const normalizedName = name.toLowerCase();
    return this._tools.delete(normalizedName);
  }

  /**
   * Find a tool by name (case-insensitive).
   * @param {string} name
   * @returns {import('./types').AgentTool | undefined}
   */
  get(name) {
    return this._tools.get(name.toLowerCase());
  }

  /**
   * Check if a tool exists by name.
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this._tools.has(name.toLowerCase());
  }

  /**
   * Get all registered tools as an array (metadata only, execute functions included).
   * @returns {import('./types').AgentTool[]}
   */
  getAll() {
    return Array.from(this._tools.values());
  }

  /**
   * Get tool metadata for LLM consumption (name, description, parameters — no execute function).
   * This is what gets sent to the LLM API.
   * @param {string} name
   * @returns {{name: string, label: string, description: string, parameters: Object} | null}
   */
  getMetadata(name) {
    const tool = this.get(name);
    if (!tool) return null;
    return {
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters,
    };
  }

  /**
   * Get all tool metadata for LLM consumption.
   * @returns {Array<{name: string, label: string, description: string, parameters: Object}>}
   */
  getAllMetadata() {
    return this.getAll().map((t) => ({
      name: t.name,
      label: t.label,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  /**
   * Get the number of registered tools.
   * @returns {number}
   */
  get size() {
    return this._tools.size;
  }

  /**
   * Clear all registered tools.
   * @returns {this}
   */
  clear() {
    this._tools.clear();
    return this;
  }

  /**
   * Validate and prepare tool arguments.
   * If the tool has a prepareArguments shim, apply it first.
   * Then validate against the JSON Schema.
   * @param {string} toolName
   * @param {Object} args
   * @returns {{valid: boolean, args?: Object, errors?: string[]}}
   */
  prepareAndValidateArgs(toolName, args) {
    const tool = this.get(toolName);
    if (!tool) {
      return { valid: false, errors: [`Tool "${toolName}" not found`] };
    }

    // Apply prepareArguments shim if present
    let preparedArgs = args;
    if (typeof tool.prepareArguments === 'function') {
      try {
        preparedArgs = tool.prepareArguments(args);
      } catch (err) {
        return { valid: false, errors: [`prepareArguments error: ${err.message}`] };
      }
    }

    // Validate against schema
    const validation = validateToolArguments(tool, preparedArgs);
    if (!validation.valid) {
      return { valid: false, errors: validation.errors };
    }

    return { valid: true, args: preparedArgs };
  }

  /**
   * Execute a tool by name with validated arguments.
   * Returns a standardized result object.
   * @param {string} toolName
   * @param {Object} args
   * @param {string} toolCallId
   * @param {AbortSignal} [signal]
   * @param {function(import('./types').AgentToolResult): void} [onUpdate]
   * @returns {Promise<import('./types').AgentToolResult>}
   */
  async execute(toolName, args, toolCallId, signal, onUpdate) {
    const tool = this.get(toolName);
    if (!tool) {
      return {
        content: `Tool "${toolName}" not found in registry.`,
        isError: true,
      };
    }

    // Validate args first
    const prepResult = this.prepareAndValidateArgs(toolName, args);
    if (!prepResult.valid) {
      return {
        content: `Invalid arguments for tool "${toolName}": ${prepResult.errors.join(', ')}`,
        isError: true,
      };
    }

    // Execute the tool
    try {
      const result = await tool.execute(toolCallId, prepResult.args, signal, onUpdate);
      return {
        content: result?.content ?? '',
        details: result?.details,
        isError: Boolean(result?.isError),
      };
    } catch (err) {
      return {
        content: `Tool "${toolName}" execution error: ${err.message || String(err)}`,
        isError: true,
      };
    }
  }
}

module.exports = {
  ToolRegistry,
  validateToolDefinition,
  validateToolArguments,
};
