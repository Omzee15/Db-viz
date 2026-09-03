"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useUpdateNodeInternals,
  ReactFlowProvider,
  Panel,
  Handle,
  Position,
  getNodesBounds,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toPng } from "html-to-image";
import { Parser, importer } from "@dbml/core";
import {
  Database,
  ZoomIn,
  Eye,
  EyeOff,
  Search,
  Layers,
  ChevronDown,
  Loader2,
  Plus,
  X,
  Download,
  ImageDown,
  Sparkles,
} from "lucide-react";

// PostgreSQL reserved keywords that @dbml/core's ANTLR parser cannot accept as
// bare (unquoted) column identifiers inside CREATE TABLE statements.
const _SQL_RESERVED = new Set([
  'all','analyse','analyze','and','any','array','as','asc','asymmetric',
  'both','case','cast','check','collate','column','constraint','create',
  'cross','current_catalog','current_date','current_role','current_schema',
  'current_time','current_timestamp','current_user','default','deferrable',
  'desc','distinct','do','else','end','except','false','fetch','for',
  'foreign','from','grant','group','having','in','initially','inner',
  'intersect','into','is','join','lateral','leading','left','like',
  'limit','localtime','localtimestamp','natural','not','null','offset',
  'on','only','or','order','outer','overlaps','primary','references',
  'returning','right','select','session_user','similar','some','symmetric',
  'table','tablesample','then','to','trailing','true','union','unique',
  'user','using','variadic','verbose','when','where','window','with',
]);
const _CONSTRAINT_STARTS = new Set([
  'primary','constraint','unique','check','foreign','exclude',
]);

/** Wrap bare reserved-keyword column names in double quotes so the DBML
 *  importer can parse them without a syntax error. */
function quoteReservedColumnNames(sql: string): string {
  return sql.replace(
    /^([ \t]+)([a-zA-Z_][a-zA-Z0-9_]*)([  \t])/gm,
    (match, indent, name, space) => {
      const lower = name.toLowerCase();
      if (_CONSTRAINT_STARTS.has(lower)) return match;
      if (_SQL_RESERVED.has(lower)) return `${indent}"${name}"${space}`;
      return match;
    }
  );
}

// ---------------------------------------------------------------------------
// Schema-text editing helpers
//
// The text editor (DBML or SQL) is the single source of truth. When the user
// adds a table or a column from the visual viewer we splice the change into the
// existing text rather than regenerating it, so comments / formatting / enums
// are preserved.
// ---------------------------------------------------------------------------

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isSqlFileName = (fileName: string) =>
  fileName.toLowerCase().endsWith(".sql");

/** Append a new empty table definition to the schema text. */
function appendTableToText(
  content: string,
  fileName: string,
  tableName: string
): string {
  const trimmed = content.replace(/\s+$/, "");
  const gap = trimmed.length > 0 ? "\n\n" : "";

  if (isSqlFileName(fileName)) {
    const block = `CREATE TABLE ${tableName} (\n  id serial PRIMARY KEY\n);`;
    return `${trimmed}${gap}${block}\n`;
  }

  const block = `Table ${tableName} {\n  id int [pk]\n}`;
  return `${trimmed}${gap}${block}\n`;
}

/** Locate the body span { ... } / ( ... ) of a table definition in the text.
 *  Returns the index just before the closing brace/paren, plus the indent used
 *  by the existing column lines (best effort). */
function findTableInsertionPoint(
  content: string,
  fileName: string,
  tableName: string
): { insertAt: number; indent: string } | null {
  const escaped = escapeRegExp(tableName);
  const isSql = isSqlFileName(fileName);

  const headerRe = isSql
    ? new RegExp(
        `\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["\`]?${escaped}["\`]?\\s*\\(`,
        "i"
      )
    : new RegExp(`\\bTable\\s+["\`]?${escaped}["\`]?\\s*(?:as\\s+\\w+\\s*)?\\{`, "i");

  const header = headerRe.exec(content);
  if (!header || header.index === undefined) return null;

  const open = isSql ? "(" : "{";
  const close = isSql ? ")" : "}";
  const bodyStart = content.indexOf(open, header.index + header[0].length - 1);
  if (bodyStart === -1) return null;

  // Walk forward tracking nesting to find the matching close.
  let depth = 0;
  let bodyEnd = -1;
  for (let i = bodyStart; i < content.length; i++) {
    const ch = content[i];
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        bodyEnd = i;
        break;
      }
    }
  }
  if (bodyEnd === -1) return null;

  const body = content.slice(bodyStart + 1, bodyEnd);
  const indentMatch = body.match(/\n([ \t]+)\S/);
  const indent = indentMatch ? indentMatch[1] : "  ";

  // DBML requires every column to come BEFORE the table's `indexes { ... }` /
  // `Note { ... }` sub-blocks. If the body ends with such a block, insert the
  // new column just before it; otherwise insert after the last field line.
  let sectionEnd = bodyEnd; // exclusive upper bound for the insertion point
  if (!isSql) {
    // Find the earliest top-level sub-block inside the body (relative to
    // bodyStart+1). Sub-blocks are `indexes {`, `Note {`, etc. — anything that
    // isn't a column and opens a nested brace.
    const subBlockRe = /\n[ \t]*(indexes|note)\b[^\n{]*\{/gi;
    let m: RegExpExecArray | null;
    let earliest = -1;
    while ((m = subBlockRe.exec(body)) !== null) {
      // Only care about blocks at the table's top nesting level. Since the
      // body string is already the table interior, any match here is top-level
      // unless it sits inside another sub-block — but nested index/note blocks
      // aren't valid DBML, so the first match is the boundary.
      earliest = m.index; // offset of the leading "\n" within `body`
      break;
    }
    if (earliest !== -1) {
      sectionEnd = bodyStart + 1 + earliest;
    }
  }

  // Insert right after the last non-blank char before `sectionEnd`.
  let insertAt = sectionEnd;
  while (insertAt > bodyStart + 1 && /\s/.test(content[insertAt - 1])) {
    insertAt--;
  }

  return { insertAt, indent };
}

/** Add a new column to an existing table.
 *
 *  For DBML we splice a new field line into the table body. For SQL we append
 *  an `ALTER TABLE ... ADD COLUMN` statement instead of editing the CREATE
 *  TABLE body — that stays valid regardless of trailing table constraints. */
function addColumnToText(
  content: string,
  fileName: string,
  tableName: string,
  columnName: string,
  columnType: string
): string | null {
  if (isSqlFileName(fileName)) {
    // Confirm the table actually exists in the text first.
    const escaped = escapeRegExp(tableName);
    const existsRe = new RegExp(
      `\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["\`]?${escaped}["\`]?\\s*\\(`,
      "i"
    );
    if (!existsRe.test(content)) return null;
    const type = columnType.trim() || "text";
    const trimmed = content.replace(/\s+$/, "");
    return `${trimmed}\n\nALTER TABLE ${tableName} ADD COLUMN ${columnName} ${type};\n`;
  }

  const point = findTableInsertionPoint(content, fileName, tableName);
  if (!point) return null;
  const { insertAt, indent } = point;
  const type = columnType.trim() || "varchar";
  const line = `\n${indent}${columnName} ${type}`;
  return content.slice(0, insertAt) + line + content.slice(insertAt);
}

/** Add a foreign key from sourceTable.sourceColumn -> targetTable.targetColumn.
 *
 *  DBML: append a `Ref` line. SQL: append an `ALTER TABLE ... ADD CONSTRAINT
 *  ... FOREIGN KEY` statement. Returns null if either table is missing, or if
 *  an identical reference already exists in the text. */
function addForeignKeyToText(
  content: string,
  fileName: string,
  sourceTable: string,
  sourceColumn: string,
  targetTable: string,
  targetColumn: string
): string | null {
  const trimmed = content.replace(/\s+$/, "");

  if (isSqlFileName(fileName)) {
    const st = escapeRegExp(sourceTable);
    const tt = escapeRegExp(targetTable);
    const createRe = (t: string) =>
      new RegExp(
        `\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["\`]?${t}["\`]?\\s*\\(`,
        "i"
      );
    if (!createRe(st).test(content) || !createRe(tt).test(content)) return null;

    // Skip if the same FK already exists.
    const dupeRe = new RegExp(
      `ALTER\\s+TABLE\\s+["\`]?${st}["\`]?\\s+ADD\\s+CONSTRAINT[\\s\\S]*?FOREIGN\\s+KEY\\s*\\(\\s*["\`]?${escapeRegExp(
        sourceColumn
      )}["\`]?\\s*\\)\\s*REFERENCES\\s+["\`]?${tt}["\`]?`,
      "i"
    );
    if (dupeRe.test(content)) return null;

    const constraintName = `fk_${sourceTable}_${sourceColumn}_${targetTable}`.slice(
      0,
      63
    );
    const stmt = `ALTER TABLE ${sourceTable} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${sourceColumn}) REFERENCES ${targetTable} (${targetColumn});`;
    return `${trimmed}\n\n${stmt}\n`;
  }

  // DBML: make sure both tables are defined.
  const tableRe = (t: string) =>
    new RegExp(`\\bTable\\s+["\`]?${escapeRegExp(t)}["\`]?\\s*(?:as\\s+\\w+\\s*)?\\{`, "i");
  if (!tableRe(sourceTable).test(content) || !tableRe(targetTable).test(content)) {
    return null;
  }

  const dupeRe = new RegExp(
    `\\bRef\\b[^\\n]*\\b${escapeRegExp(sourceTable)}\\.${escapeRegExp(
      sourceColumn
    )}\\b[^\\n]*\\b${escapeRegExp(targetTable)}\\.${escapeRegExp(targetColumn)}\\b`,
    "i"
  );
  if (dupeRe.test(content)) return null;

  const ref = `Ref: ${sourceTable}.${sourceColumn} > ${targetTable}.${targetColumn}`;
  return `${trimmed}\n\n${ref}\n`;
}

interface Column {
  name: string;
  type: string;
  isPrimary: boolean;
  isForeign: boolean;
  isUnique: boolean;
  notNull: boolean;
}

interface TableNodeData extends Record<string, unknown> {
  name: string;
  columns: Column[];
  // Present only when the schema is editable. Lets the table header show a
  // "+" button that adds a new column.
  onAddColumn?: (tableName: string) => void;
  // Field-level FK drag-to-connect. `armedColumn` is the column the user
  // double-clicked to start a connection from (only meaningful on that table's
  // node); `connecting` is true on every node while a drag is in progress;
  // `onArmColumn` toggles the armed field.
  connectable?: boolean;
  armedColumn?: string | null;
  connecting?: boolean;
  onArmColumn?: (tableName: string, columnName: string) => void;
}

type TableNodeType = Node<TableNodeData, "table">;

interface DBViewerProps {
  dbmlContent: string;
  fileName: string;
  layoutData: string;
  onLayoutChange: (layoutData: string) => void;
  onTableSelect?: (tableName: string) => void;
  // When provided, the viewer becomes editable: an "Add table" button appears
  // in the toolbar and each table gets a "+" button to add a column. The new
  // schema text (DBML or SQL, matching the file) is passed back here.
  onDbmlChange?: (nextContent: string) => void;
  // Live-connection schema controls. When provided, a "Schemas" dropdown is
  // shown next to the search box so the user can change which schemas are
  // visualized. Omitted for plain file viewing.
  schemaOptions?: string[];
  selectedSchemas?: string[];
  onSchemasChange?: (next: string[]) => void;
  // When provided, a "Fix Error" AI button appears in the parse-error box. The
  // full schema text + the error are sent to the assistant and the corrected
  // schema is passed back here to replace the editor content. `aiFixEnabled`
  // reflects whether the user has configured a Gemini API key; when false the
  // button is shown but points the user to Settings.
  onAiFix?: (fixedContent: string) => void;
  aiFixEnabled?: boolean;
  // Opens the account settings so the user can add a Gemini API key. Called when
  // "Fix Error" is clicked but no key is configured.
  onConfigureAi?: () => void;
}

// Custom Table Node Component - Solarized Light theme like Project-Nest
function TableNode({ id, data }: NodeProps<TableNodeType>) {
  const [isExpanded, setIsExpanded] = useState(true);
  const updateNodeInternals = useUpdateNodeInternals();

  // ReactFlow caches each node's handle geometry; re-measure whenever the set
  // of field handles or their arm state changes, otherwise drops onto field
  // handles are not detected.
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, isExpanded, data.armedColumn, data.connecting, data.connectable, data.columns, updateNodeInternals]);

  return (
    <div className="relative rounded-lg shadow-md min-w-[250px] max-w-[350px] overflow-hidden" style={{ background: '#E8DFD0', border: '1px solid #D9CDBF' }}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "transparent", border: "none", opacity: 0 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "transparent", border: "none", opacity: 0 }}
      />
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "transparent", border: "none", opacity: 0 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "transparent", border: "none", opacity: 0 }}
      />

      {/* Primary Header - Olive/Tan */}
      <div className="font-semibold text-sm flex items-center justify-between" style={{ background: '#9B8F5E', padding: '10px 14px' }}>
        <div className="flex items-center gap-2 text-white">
          <Database className="h-4 w-4" />
          {data.name}
        </div>
        <div className="flex items-center" style={{ gap: '2px' }}>
          {data.onAddColumn && (
            <button
              onClick={() => data.onAddColumn?.(data.name)}
              className="hover:bg-white/20 rounded text-white"
              style={{ padding: '4px' }}
              title="Add row (column)"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="hover:bg-white/20 rounded text-white"
            style={{ padding: '4px' }}
            title={isExpanded ? "Hide columns" : "Show columns"}
          >
            {isExpanded ? (
              <EyeOff className="h-3 w-3" />
            ) : (
              <Eye className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>

      {/* Columns */}
      {isExpanded && (
        <div style={{ padding: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {data.columns?.map((column, index) => {
              const isArmed = data.armedColumn === column.name;
              return (
              <div
                key={index}
                className={`relative flex items-center justify-between text-xs rounded${data.connectable ? " nodrag" : ""}`}
                onDoubleClickCapture={
                  data.connectable
                    ? (e) => {
                        e.stopPropagation();
                        data.onArmColumn?.(data.name, column.name);
                      }
                    : undefined
                }
                style={{
                  padding: '5px 8px',
                  cursor: data.connectable ? (isArmed ? 'crosshair' : 'pointer') : undefined,
                  background: isArmed ? 'rgba(155, 143, 94, 0.28)' :
                              column.isPrimary ? 'rgba(196, 117, 108, 0.15)' :
                              column.isForeign ? 'rgba(90, 130, 170, 0.15)' :
                              'transparent',
                  borderLeft: isArmed ? '3px solid #9B8F5E' :
                              column.isPrimary ? '3px solid #C4756C' :
                              column.isForeign ? '3px solid #5A82AA' :
                              '3px solid transparent'
                }}
              >
                {data.connectable && (
                  <>
                    {/* Drop target: every field can receive a FK. Kept mounted
                        at all times so ReactFlow has its geometry; enlarged and
                        visible only while a connection drag is active. */}
                    <Handle
                      type="target"
                      id={`${column.name}__t`}
                      position={Position.Left}
                      isConnectableStart={false}
                      isConnectable={!!data.connecting && !isArmed}
                      style={{
                        left: -7,
                        width: data.connecting ? 14 : 8,
                        height: data.connecting ? 14 : 8,
                        borderRadius: '50%',
                        background: data.connecting ? '#9B8F5E' : 'transparent',
                        border: data.connecting ? '2px solid #FFFFFF' : 'none',
                        opacity: data.connecting && !isArmed ? 0.9 : 0,
                        transition: 'opacity 0.1s',
                      }}
                    />
                    {/* FK source dot: only the armed field shows one. */}
                    <Handle
                      type="source"
                      id={`${column.name}__s`}
                      position={Position.Right}
                      isConnectableStart={isArmed}
                      isConnectableEnd={false}
                      isConnectable={isArmed}
                      style={{
                        right: -7,
                        width: isArmed ? 14 : 8,
                        height: isArmed ? 14 : 8,
                        borderRadius: '50%',
                        background: isArmed ? '#9B8F5E' : 'transparent',
                        border: isArmed ? '2px solid #FFFFFF' : 'none',
                        opacity: isArmed ? 1 : 0,
                        cursor: 'crosshair',
                      }}
                    />
                    {/* When armed, a transparent full-row source handle so the
                        user can start the drag from anywhere on the field. */}
                    {isArmed && (
                      <Handle
                        type="source"
                        id={`${column.name}__srow`}
                        position={Position.Right}
                        isConnectableStart
                        isConnectableEnd={false}
                        style={{
                          left: 0,
                          top: 0,
                          transform: 'none',
                          width: '100%',
                          height: '100%',
                          borderRadius: 6,
                          background: 'transparent',
                          border: 'none',
                          opacity: 0,
                          cursor: 'crosshair',
                          zIndex: 1,
                        }}
                      />
                    )}
                  </>
                )}
                <div className="flex items-center flex-1 min-w-0" style={{ gap: '8px' }}>
                  <span
                    className="font-medium truncate"
                    style={{
                      color: column.isPrimary ? '#C4756C' : 
                             column.isForeign ? '#5A82AA' : 
                             '#3E2723'
                    }}
                  >
                    {column.name}
                  </span>
                  <span
                    className="rounded"
                    style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      background: column.isPrimary ? '#C4756C' : 
                                  column.isForeign ? '#5A82AA' : 
                                  '#D9CDBF',
                      color: column.isPrimary || column.isForeign ? '#FFFFFF' : '#3E2723'
                    }}
                  >
                    {column.type}
                  </span>
                </div>
                <div className="flex" style={{ gap: '4px', marginLeft: '8px' }}>
                  {column.isPrimary && (
                    <span className="text-white rounded font-bold" style={{ background: '#C4756C', fontSize: '9px', padding: '2px 5px' }}>
                      PK
                    </span>
                  )}
                  {column.isForeign && (
                    <span className="text-white rounded font-bold" style={{ background: '#5A82AA', fontSize: '9px', padding: '2px 5px' }}>
                      FK
                    </span>
                  )}
                  {column.isUnique && (
                    <span className="rounded" style={{ background: '#D9CDBF', color: '#8B7355', fontSize: '9px', padding: '2px 5px' }}>
                      U
                    </span>
                  )}
                  {column.notNull && (
                    <span className="rounded" style={{ border: '1px solid #D9CDBF', color: '#8B7355', fontSize: '9px', padding: '2px 5px' }}>
                      NN
                    </span>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const nodeTypes = {
  table: TableNode,
};

// Inner component that uses ReactFlow hooks
function DBViewerInner({ dbmlContent, fileName, layoutData, onLayoutChange, onTableSelect, onDbmlChange, schemaOptions, selectedSchemas, onSchemasChange, onAiFix, aiFixEnabled, onConfigureAi }: DBViewerProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // "Fix Error" AI assistant state.
  const [isFixing, setIsFixing] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isInteractive, setIsInteractive] = useState(true);
  const [lockWarning, setLockWarning] = useState(false);
  const [showSchemaDropdown, setShowSchemaDropdown] = useState(false);
  const schemaRef = useRef<HTMLDivElement>(null);
  const isRestoring = useRef(false);
  const lockWarningTimeout = useRef<NodeJS.Timeout | null>(null);

  // Diagram image export. `exportPreview` holds the generated PNG data URL shown
  // in the preview modal before the user commits to downloading it.
  const [isExporting, setIsExporting] = useState(false);
  const [exportPreview, setExportPreview] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const editable = typeof onDbmlChange === "function";
  // Latest schema text, kept in a ref so the memoized node data callbacks always
  // splice into the current version.
  const dbmlContentRef = useRef(dbmlContent);
  useEffect(() => {
    dbmlContentRef.current = dbmlContent;
  }, [dbmlContent]);

  // "Add table" prompt (toolbar) and "Add column" prompt (per table).
  const [showAddTable, setShowAddTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [addColumnFor, setAddColumnFor] = useState<string | null>(null);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const isSql = fileName.toLowerCase().endsWith(".sql");

  // Field the user double-clicked to start dragging a foreign key from.
  const [armedField, setArmedField] = useState<{
    table: string;
    column: string;
  } | null>(null);
  const armedFieldRef = useRef(armedField);
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    armedFieldRef.current = armedField;
    // Push the armed-column marker into node data without re-parsing the schema.
    // `armedColumn` is set only on the armed table; `connecting` is set on every
    // node so all tables re-render their field handles as active drop targets.
    const connecting = armedField != null;
    const changedIds: string[] = [];
    setNodes((nds) =>
      nds.map((n) => {
        const nextArmed =
          armedField && armedField.table === n.id ? armedField.column : null;
        if (n.data.armedColumn === nextArmed && n.data.connecting === connecting) {
          return n;
        }
        changedIds.push(n.id);
        return {
          ...n,
          data: { ...n.data, armedColumn: nextArmed, connecting },
        };
      })
    );
    // Let ReactFlow re-measure the handle geometry after the DOM updates.
    const raf = requestAnimationFrame(() => {
      changedIds.forEach((nid) => updateNodeInternals(nid));
    });
    return () => cancelAnimationFrame(raf);
  }, [armedField, setNodes, updateNodeInternals]);
  // Transient toast shown after a FK is created / rejected.
  const [connectToast, setConnectToast] = useState<string | null>(null);
  const connectToastTimeout = useRef<NodeJS.Timeout | null>(null);
  const flashToast = useCallback((msg: string) => {
    setConnectToast(msg);
    if (connectToastTimeout.current) clearTimeout(connectToastTimeout.current);
    connectToastTimeout.current = setTimeout(() => setConnectToast(null), 2500);
  }, []);

  const handleAddTable = useCallback(() => {
    const name = newTableName.trim();
    if (!name) return;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      setEditError("Table name must be a valid identifier");
      return;
    }
    if (nodes.some((n) => n.id.toLowerCase() === name.toLowerCase())) {
      setEditError(`Table "${name}" already exists`);
      return;
    }
    onDbmlChange?.(appendTableToText(dbmlContentRef.current, fileName, name));
    setNewTableName("");
    setShowAddTable(false);
    setEditError(null);
  }, [newTableName, nodes, fileName, onDbmlChange]);

  // Stable so it can be baked into node data without re-parsing.
  const openAddColumn = useCallback((tableName: string) => {
    setAddColumnFor(tableName);
    setNewColumnName("");
    setNewColumnType("");
    setEditError(null);
  }, []);

  // Double-click a field to arm it as the FK source (toggles off if it's
  // already the armed field). Stable so it can live in node data.
  const armColumn = useCallback((tableName: string, columnName: string) => {
    setArmedField((prev) =>
      prev && prev.table === tableName && prev.column === columnName
        ? null
        : { table: tableName, column: columnName }
    );
  }, []);

  // Field handle ids are `<column>__s` / `__srow` (source) and `<column>__t`
  // (target); strip the suffix back to the column name.
  const columnFromHandle = (h?: string | null) =>
    h ? h.replace(/__(s|srow|t)$/, "") : undefined;

  // Fired when the user finishes dragging from an armed field's handle onto
  // another field's handle.
  const handleConnect = useCallback(
    (conn: {
      source?: string | null;
      target?: string | null;
      sourceHandle?: string | null;
      targetHandle?: string | null;
    }) => {
      const armed = armedFieldRef.current;
      const sourceTable = conn.source ?? undefined;
      const targetTable = conn.target ?? undefined;
      const sourceColumn =
        columnFromHandle(conn.sourceHandle) ?? armed?.column ?? undefined;
      const targetColumn = columnFromHandle(conn.targetHandle);

      if (!sourceTable || !targetTable || !sourceColumn || !targetColumn) {
        flashToast("Drop onto a field to create a foreign key");
        return;
      }
      if (sourceTable === targetTable && sourceColumn === targetColumn) {
        setArmedField(null);
        return;
      }

      const next = addForeignKeyToText(
        dbmlContentRef.current,
        fileName,
        sourceTable,
        sourceColumn,
        targetTable,
        targetColumn
      );
      setArmedField(null);
      if (!next) {
        flashToast("That foreign key already exists");
        return;
      }
      onDbmlChange?.(next);
      flashToast(
        `FK: ${sourceTable}.${sourceColumn} → ${targetTable}.${targetColumn}`
      );
    },
    [fileName, onDbmlChange, flashToast]
  );

  const handleAddColumn = useCallback(() => {
    const table = addColumnFor;
    const name = newColumnName.trim();
    if (!table || !name) return;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      setEditError("Column name must be a valid identifier");
      return;
    }
    const node = nodes.find((n) => n.id === table);
    if (node?.data.columns?.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setEditError(`Column "${name}" already exists in ${table}`);
      return;
    }
    const next = addColumnToText(
      dbmlContentRef.current,
      fileName,
      table,
      name,
      newColumnType
    );
    if (!next) {
      setEditError(`Couldn't locate table "${table}" in the source text`);
      return;
    }
    onDbmlChange?.(next);
    setNewColumnName("");
    setNewColumnType("");
    setAddColumnFor(null);
    setEditError(null);
  }, [addColumnFor, newColumnName, newColumnType, nodes, fileName, onDbmlChange]);

  // Show lock warning when trying to interact with locked canvas
  const handleLockedInteraction = () => {
    if (!isInteractive) {
      setLockWarning(true);
      if (lockWarningTimeout.current) clearTimeout(lockWarningTimeout.current);
      lockWarningTimeout.current = setTimeout(() => setLockWarning(false), 2000);
    }
  };
  const prevDbmlContent = useRef(dbmlContent);
  const searchRef = useRef<HTMLDivElement>(null);
  const { fitView, getViewport, setCenter } = useReactFlow();

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as HTMLElement)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close schema dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (schemaRef.current && !schemaRef.current.contains(e.target as HTMLElement)) {
        setShowSchemaDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape cancels an armed FK-connect.
  useEffect(() => {
    if (!armedField) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setArmedField(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [armedField]);

  // Parse DBML when content changes
  useEffect(() => {
    if (dbmlContent !== prevDbmlContent.current) {
      prevDbmlContent.current = dbmlContent;
      if (dbmlContent.trim()) {
        parseDBML(dbmlContent, layoutData);
      } else {
        setNodes([]);
        setEdges([]);
      }
    }
  }, [dbmlContent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial parse
  useEffect(() => {
    if (dbmlContent.trim()) {
      parseDBML(dbmlContent, layoutData);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveCurrentLayout = useCallback(() => {
    if (isRestoring.current || nodes.length === 0) return "";
    
    const viewport = getViewport();
    const layoutData = {
      nodes: nodes.map((node) => ({
        id: node.id,
        position: node.position,
      })),
      viewport: {
        x: viewport.x,
        y: viewport.y,
        zoom: viewport.zoom,
      },
    };
    return JSON.stringify(layoutData);
  }, [nodes, getViewport]);

  const restoreLayout = useCallback(
    (layoutDataStr: string, newNodes: Node[]) => {
      isRestoring.current = true;
      try {
        const layoutData = JSON.parse(layoutDataStr);

        const restoredNodes = newNodes.map((node) => {
          const savedNode = layoutData.nodes?.find(
            (n: { id: string }) => n.id === node.id
          );
          if (savedNode) {
            return {
              ...node,
              position: savedNode.position,
            };
          }
          return node;
        });

        setNodes(restoredNodes as TableNodeType[]);

        if (layoutData.viewport) {
          setTimeout(() => {
            fitView({ duration: 0 });
          }, 100);
        }

        return restoredNodes;
      } catch {
        return newNodes;
      } finally {
        setTimeout(() => {
          isRestoring.current = false;
        }, 500);
      }
    },
    [setNodes, fitView]
  );

  // Preprocess DBML to remove unsupported syntax and clean up whitespace
  const preprocessDBML = (content: string): string => {
    const lines = content.split('\n');
    const result: string[] = [];
    let insideProjectBlock = false;
    let braceCount = 0;
    let lastLineWasEmpty = false;
    let insideBlock = false;
    let blockBraceCount = 0;
    
    for (const line of lines) {
      // Trim the line and remove any non-standard whitespace
      const cleanedLine = line.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ');
      const trimmedLine = cleanedLine.trim();
      
      // Check if this line starts a Project block
      if (!insideProjectBlock && /^Project\s+\w+\s*\{?/i.test(trimmedLine)) {
        insideProjectBlock = true;
        braceCount = (cleanedLine.match(/\{/g) || []).length - (cleanedLine.match(/\}/g) || []).length;
        if (braceCount <= 0) {
          insideProjectBlock = false;
          braceCount = 0;
        }
        continue;
      }
      
      // If inside Project block, track braces
      if (insideProjectBlock) {
        braceCount += (cleanedLine.match(/\{/g) || []).length;
        braceCount -= (cleanedLine.match(/\}/g) || []).length;
        if (braceCount <= 0) {
          insideProjectBlock = false;
          braceCount = 0;
        }
        continue;
      }
      
      // Track if we're inside a block (table, enum, etc.)
      const openBraces = (cleanedLine.match(/\{/g) || []).length;
      const closeBraces = (cleanedLine.match(/\}/g) || []).length;
      blockBraceCount += openBraces - closeBraces;
      insideBlock = blockBraceCount > 0;
      
      // Skip blank lines inside blocks - parser doesn't like them
      if (trimmedLine === '' && insideBlock) {
        continue;
      }
      
      // Skip consecutive empty lines outside blocks
      if (trimmedLine === '') {
        if (lastLineWasEmpty) {
          continue;
        }
        lastLineWasEmpty = true;
        result.push('');
      } else {
        lastLineWasEmpty = false;
        result.push(cleanedLine);
      }
    }
    
    // Remove leading/trailing empty lines and join
    const finalResult = result.join('\n').trim();
    return finalResult;
  };

  const preprocessSQLForImport = (content: string): string => {
    const withoutBlockComments = content.replace(/\/\*[\s\S]*?\*\//g, "");
    const withoutLineComments = withoutBlockComments.replace(/--.*$/gm, "");
    const statements = withoutLineComments.split(";");
    const trimmedStatements = statements.map((stmt) => stmt.trim());

    let relevantStatements = trimmedStatements.filter(
      (stmt) =>
        /^CREATE\s+TABLE\b/i.test(stmt) ||
        /^ALTER\s+TABLE\b[\s\S]*?FOREIGN\s+KEY/i.test(stmt)
    );

    // The @dbml/core importer ignores `ALTER TABLE ... ADD COLUMN`, so fold
    // those columns into the matching CREATE TABLE body before importing. This
    // is what makes viewer-added columns (which we persist as ALTER statements)
    // show up in the diagram.
    const addColumnStmts = trimmedStatements.filter((stmt) =>
      /^ALTER\s+TABLE\b[\s\S]*?\bADD\s+COLUMN\b/i.test(stmt)
    );
    for (const alter of addColumnStmts) {
      const m = alter.match(
        /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?["`]?([A-Za-z_][A-Za-z0-9_]*)["`]?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([\s\S]+)$/i
      );
      if (!m) continue;
      const [, tbl, colDef] = m;
      const createRe = new RegExp(
        `(CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["\`]?${escapeRegExp(
          tbl
        )}["\`]?\\s*\\([\\s\\S]*?)(\\n?\\s*\\)\\s*)$`,
        "i"
      );
      relevantStatements = relevantStatements.map((stmt) =>
        createRe.test(stmt)
          ? stmt.replace(createRe, `$1,\n  ${colDef.trim()}$2`)
          : stmt
      );
    }

    if (relevantStatements.length === 0) return "";
    const joined = relevantStatements.join(";\n\n") + ";";
    return quoteReservedColumnNames(joined);
  };

  const parseDBML = useCallback(
    async (content: string, layout?: string) => {
      if (!content.trim()) return;

      setIsLoading(true);
      setError(null);
      setFixError(null);

      try {
        let dbmlContent: string;
        const isSqlFile = fileName.toLowerCase().endsWith('.sql');
        
        if (isSqlFile) {
          // Convert SQL to DBML first
          console.log('Detected SQL file, converting to DBML...');
          try {
            const sanitizedSql = preprocessSQLForImport(content);
            const sqlForImport = sanitizedSql.trim() ? sanitizedSql : content;
            // Try PostgreSQL first (most common)
            dbmlContent = importer.import(sqlForImport, 'postgres');
          } catch {
            try {
              // Fallback to MySQL
              const sanitizedSql = preprocessSQLForImport(content);
              const sqlForImport = sanitizedSql.trim() ? sanitizedSql : content;
              dbmlContent = importer.import(sqlForImport, 'mysql');
            } catch {
              // Last resort: try legacy postgres
              const sanitizedSql = preprocessSQLForImport(content);
              const sqlForImport = sanitizedSql.trim() ? sanitizedSql : content;
              dbmlContent = importer.import(sqlForImport, 'postgresLegacy');
            }
          }
          console.log('Converted SQL to DBML:', dbmlContent);
        } else {
          // Preprocess DBML to remove unsupported syntax
          dbmlContent = preprocessDBML(content);
        }
        
        // Debug: log processed content
        console.log('Final DBML content to parse:');
        console.log(dbmlContent);
        console.log('---');
        
        const parser = new Parser();
        const database = parser.parse(dbmlContent, "dbml");

        const foreignKeys = new Set<string>();
        database.schemas[0]?.refs?.forEach((ref) => {
          const sourceEndpoint = ref.endpoints[0];
          if (sourceEndpoint?.tableName && sourceEndpoint?.fieldNames) {
            sourceEndpoint.fieldNames.forEach((fieldName: string) => {
              foreignKeys.add(`${sourceEndpoint.tableName}.${fieldName}`);
            });
          }
        });

        const tableNodes: TableNodeType[] =
          database.schemas[0]?.tables.map((table, index) => {
            const columns: Column[] = table.fields.map((field) => ({
              name: field.name,
              type: field.type.type_name,
              isPrimary: field.pk,
              isForeign: foreignKeys.has(`${table.name}.${field.name}`),
              isUnique: field.unique,
              notNull: field.not_null,
            }));

            return {
              id: table.name,
              type: "table" as const,
              position: {
                x: (index % 4) * 400 + 50,
                y: Math.floor(index / 4) * 350 + 50,
              },
              data: {
                name: table.name,
                columns: columns,
                onAddColumn: editable ? openAddColumn : undefined,
                connectable: editable,
                onArmColumn: editable ? armColumn : undefined,
                armedColumn:
                  armedFieldRef.current?.table === table.name
                    ? armedFieldRef.current.column
                    : null,
              },
              draggable: true,
            };
          }) || [];

        const relationshipEdges: Edge[] = [];
        database.schemas[0]?.refs?.forEach((ref, index) => {
          const sourceTable = ref.endpoints[0]?.tableName;
          const targetTable = ref.endpoints[1]?.tableName;
          const sourceField = ref.endpoints[0]?.fieldNames?.[0];
          const targetField = ref.endpoints[1]?.fieldNames?.[0];

          if (sourceTable && targetTable) {
            relationshipEdges.push({
              id: `rel-${index}`,
              source: sourceTable,
              target: targetTable,
              type: "smoothstep",
              animated: false,
              style: {
                stroke: "#9B8F5E",
                strokeWidth: 2,
              },
              label:
                sourceField && targetField
                  ? `${sourceField} → ${targetField}`
                  : "",
              labelStyle: {
                fontSize: "10px",
                fontWeight: "500",
                fill: "#3E2723",
              },
              labelBgStyle: {
                fill: "#EBE3D5",
                stroke: "#D9CDBF",
              },
              labelBgPadding: [4, 2] as [number, number],
              labelBgBorderRadius: 4,
            });
          }
        });

        const layoutToUse = layout;
        if (layoutToUse && layoutToUse.trim() && layoutToUse !== "{}") {
          restoreLayout(layoutToUse, tableNodes);
        } else {
          setNodes(tableNodes);
          setTimeout(() => fitView({ padding: 0.1, duration: 500 }), 200);
        }

        setEdges(relationshipEdges);
      } catch (err) {
        console.error("Error parsing DBML:", err);
        let errorMessage = "Failed to parse DBML content";
        if (err instanceof Error) {
          errorMessage = err.message;
        } else if (err && typeof err === 'object') {
          // Handle DBML parser errors which may have different structure
          if ('message' in err) {
            errorMessage = String((err as { message: unknown }).message);
          } else if ('dipiag' in err || 'location' in err) {
            // DBML specific error format
            errorMessage = JSON.stringify(err, null, 2);
          } else {
            errorMessage = JSON.stringify(err);
          }
        }
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [fitView, restoreLayout, setEdges, setNodes, fileName, editable, openAddColumn, armColumn]
  );

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);

      if (isRestoring.current) return;

      const hasPositionChange = changes.some(
        (change) =>
          change.type === "position" &&
          "dragging" in change &&
          change.dragging === false
      );

      if (hasPositionChange) {
        // Layout changed, notify parent
        setTimeout(() => {
          const layoutDataStr = saveCurrentLayout();
          if (layoutDataStr) {
            onLayoutChange(layoutDataStr);
          }
        }, 100);
      }
    },
    [onNodesChange, saveCurrentLayout, onLayoutChange]
  );

  const handleFitView = () => {
    fitView({ padding: 0.1, duration: 500 });
  };

  // Send the failing schema + the parser error to the AI assistant and swap in
  // the corrected schema it returns.
  const handleAiFix = useCallback(async () => {
    if (!onAiFix || !error) return;
    if (!aiFixEnabled) {
      onConfigureAi?.();
      setFixError("Add a Gemini API key in Settings to use the AI assistant.");
      return;
    }
    setFixError(null);
    setIsFixing(true);
    try {
      const res = await fetch("/api/ai/fix-schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: dbmlContentRef.current,
          fileName,
          error,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || typeof data.fixed !== "string") {
        setFixError(data?.error || `Request failed (${res.status})`);
        return;
      }
      onAiFix(data.fixed);
    } catch (err) {
      console.error("AI fix failed:", err);
      setFixError(
        err instanceof Error ? err.message : "Failed to reach the assistant"
      );
    } finally {
      setIsFixing(false);
    }
  }, [onAiFix, error, fileName, aiFixEnabled, onConfigureAi]);

  // Render the current diagram (tables at their user-arranged positions, plus
  // relationship edges) to a PNG. We don't screenshot the visible pane — instead
  // we frame *all* nodes with padding and render at a fixed export resolution so
  // the result is self-contained regardless of how the user has panned/zoomed.
  const baseFileName = fileName.replace(/\.[^./\\]+$/, "") || "diagram";

  const handleGeneratePreview = useCallback(async () => {
    if (nodes.length === 0) return;
    setExportError(null);
    setIsExporting(true);
    try {
      const viewportEl = document.querySelector(
        ".react-flow__viewport"
      ) as HTMLElement | null;
      if (!viewportEl) throw new Error("Diagram canvas not found");

      // Frame every node with a fixed pixel margin. We pick the zoom ourselves
      // (render tables close to 1:1, only shrinking if the diagram is enormous)
      // and derive the canvas size from the scaled bounds — so the export is
      // tightly cropped instead of floating in a huge empty canvas.
      const PADDING = 80;
      const MAX_DIM = 8192;
      const bounds = getNodesBounds(nodes);

      let zoom = Math.min(
        2,
        (MAX_DIM - PADDING * 2) / bounds.width,
        (MAX_DIM - PADDING * 2) / bounds.height
      );
      zoom = Math.max(0.1, zoom);

      const imageWidth = Math.ceil(bounds.width * zoom + PADDING * 2);
      const imageHeight = Math.ceil(bounds.height * zoom + PADDING * 2);

      // Place the bounds' top-left corner at (PADDING, PADDING) after scaling.
      const x = PADDING - bounds.x * zoom;
      const y = PADDING - bounds.y * zoom;

      const dataUrl = await toPng(viewportEl, {
        backgroundColor: "#F5EFE7",
        width: imageWidth,
        height: imageHeight,
        pixelRatio: 2,
        style: {
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          transform: `translate(${x}px, ${y}px) scale(${zoom})`,
        },
        filter: (node) => {
          // Drop the interactive chrome (controls, minimap, panels, attribution)
          // so only the diagram itself is captured.
          const cls = (node as HTMLElement)?.classList;
          if (!cls) return true;
          return (
            !cls.contains("react-flow__controls") &&
            !cls.contains("react-flow__minimap") &&
            !cls.contains("react-flow__panel") &&
            !cls.contains("react-flow__attribution")
          );
        },
      });

      setExportPreview(dataUrl);
    } catch (err) {
      console.error("Failed to export diagram image:", err);
      setExportError(
        err instanceof Error ? err.message : "Failed to generate image"
      );
    } finally {
      setIsExporting(false);
    }
  }, [nodes]);

  const handleDownloadImage = useCallback(() => {
    if (!exportPreview) return;
    const link = document.createElement("a");
    link.download = `${baseFileName}.png`;
    link.href = exportPreview;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [exportPreview, baseFileName]);

  const filteredTables = nodes.filter((node) =>
    node.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const focusOnTable = (tableId: string) => {
    const node = nodes.find((n) => n.id === tableId);
    if (node) {
      setCenter(node.position.x + 125, node.position.y + 100, { zoom: 1.2, duration: 500 });
      onTableSelect?.(tableId);
      setSearchQuery("");
      setShowSearchDropdown(false);
      setSelectedIndex(0);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!showSearchDropdown || filteredTables.length === 0) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredTables.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredTables.length) % filteredTables.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      focusOnTable(filteredTables[selectedIndex].id);
    } else if (e.key === 'Escape') {
      setShowSearchDropdown(false);
    }
  };

  return (
    <div className="h-full flex flex-col" style={{ background: '#F5EFE7' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-end" style={{ background: '#FFFFFF', borderBottom: '1px solid #D9CDBF', padding: '12px 16px' }}>
        <div className="flex items-center gap-2">
          {/* Schema selector (live connections only) */}
          {schemaOptions && schemaOptions.length > 0 && onSchemasChange && (
            <div className="relative" ref={schemaRef}>
              <button
                onClick={() => setShowSchemaDropdown((v) => !v)}
                className="flex items-center gap-2 rounded-md hover:opacity-90"
                style={{ background: '#F5EEE5', border: '1px solid #D9CDBF', padding: '6px 12px', color: '#3E2723' }}
                title="Choose which schemas to visualize"
              >
                <Layers className="h-4 w-4" style={{ color: '#8B7355' }} />
                <span className="text-sm">Schemas ({(selectedSchemas ?? []).length})</span>
                <ChevronDown className="h-3.5 w-3.5" style={{ color: '#8B7355' }} />
              </button>
              {showSchemaDropdown && (
                <div
                  className="absolute top-full left-0 mt-1 rounded-md shadow-lg z-50 max-h-64 overflow-y-auto"
                  style={{ background: '#FFFFFF', border: '1px solid #D9CDBF', minWidth: '220px', padding: '6px' }}
                >
                  {schemaOptions.map((schema) => {
                    const checked = (selectedSchemas ?? []).includes(schema);
                    return (
                      <label
                        key={schema}
                        className="flex items-center gap-2 text-sm cursor-pointer rounded"
                        style={{ padding: '7px 8px', color: '#3E2723' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#EBE3D5')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const current = selectedSchemas ?? [];
                            const next = e.target.checked
                              ? [...current, schema]
                              : current.filter((s) => s !== schema);
                            // Don't allow deselecting the last schema.
                            if (next.length === 0) return;
                            onSchemasChange(next);
                          }}
                        />
                        <Database className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#9B8F5E' }} />
                        <span className="truncate">{schema}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {/* Search Box */}
          <div className="relative" ref={searchRef}>
            <div className="flex items-center gap-2 rounded-md" style={{ background: '#F5EEE5', border: '1px solid #D9CDBF', padding: '6px 12px' }}>
              <Search className="h-4 w-4" style={{ color: '#8B7355' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchDropdown(e.target.value.length > 0);
                  setSelectedIndex(0);
                }}
                onFocus={() => searchQuery.length > 0 && setShowSearchDropdown(true)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search tables..."
                className="text-sm bg-transparent border-none focus:outline-none"
                style={{ color: '#3E2723', width: '180px' }}
              />
            </div>
            {/* Search Dropdown */}
            {showSearchDropdown && filteredTables.length > 0 && (
              <div 
                className="absolute top-full left-0 mt-1 rounded-md shadow-lg z-50 max-h-48 overflow-y-auto"
                style={{ background: '#FFFFFF', border: '1px solid #D9CDBF', minWidth: '280px' }}
              >
                {filteredTables.map((node, index) => (
                  <button
                    key={node.id}
                    onClick={() => focusOnTable(node.id)}
                    className="w-full text-left text-sm flex items-center gap-2"
                    style={{ 
                      padding: '8px 12px', 
                      color: '#3E2723',
                      background: index === selectedIndex ? '#EBE3D5' : 'transparent'
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <Database className="h-3 w-3 flex-shrink-0" style={{ color: '#9B8F5E' }} />
                    <span className="truncate">{node.id}</span>
                  </button>
                ))}
              </div>
            )}
            {showSearchDropdown && searchQuery.length > 0 && filteredTables.length === 0 && (
              <div 
                className="absolute top-full left-0 mt-1 rounded-md shadow-lg z-50"
                style={{ background: '#FFFFFF', border: '1px solid #D9CDBF', padding: '8px 12px', minWidth: '280px' }}
              >
                <span className="text-sm" style={{ color: '#8B7355' }}>No tables found</span>
              </div>
            )}
          </div>

          {editable && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowAddTable((v) => !v);
                  setNewTableName("");
                  setEditError(null);
                }}
                className="flex items-center gap-2 text-sm rounded-md hover:opacity-90"
                style={{ background: '#9B8F5E', border: '1px solid #9B8F5E', color: '#FFFFFF', padding: '8px 16px' }}
                title="Add a new table"
              >
                <Plus className="h-4 w-4" />
                Add table
              </button>
              {showAddTable && (
                <div
                  className="absolute top-full right-0 mt-1 rounded-md shadow-lg z-50"
                  style={{ background: '#FFFFFF', border: '1px solid #D9CDBF', padding: '12px', minWidth: '260px' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8B7355' }}>
                      New {isSql ? 'SQL' : 'DBML'} table
                    </span>
                    <button
                      onClick={() => { setShowAddTable(false); setEditError(null); }}
                      className="rounded hover:opacity-70"
                      style={{ padding: '2px' }}
                    >
                      <X className="h-3.5 w-3.5" style={{ color: '#8B7355' }} />
                    </button>
                  </div>
                  <input
                    autoFocus
                    type="text"
                    value={newTableName}
                    onChange={(e) => { setNewTableName(e.target.value); setEditError(null); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddTable();
                      if (e.key === 'Escape') setShowAddTable(false);
                    }}
                    placeholder="table_name"
                    className="w-full text-sm rounded-md focus:outline-none"
                    style={{ background: '#F5EEE5', border: '1px solid #D9CDBF', color: '#3E2723', padding: '7px 10px' }}
                  />
                  {editError && (
                    <div className="text-xs mt-2" style={{ color: '#C4756C' }}>{editError}</div>
                  )}
                  <button
                    onClick={handleAddTable}
                    disabled={!newTableName.trim()}
                    className="w-full mt-2 text-sm rounded-md disabled:opacity-50 hover:opacity-90"
                    style={{ background: '#9B8F5E', color: '#FFFFFF', padding: '7px 10px' }}
                  >
                    Add table
                  </button>
                  <p className="text-xs mt-2" style={{ color: '#8B7355' }}>
                    Adds a starter <code>id</code> {isSql ? 'serial PRIMARY KEY' : 'int [pk]'} column. Edit the rest in the text editor.
                  </p>
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleFitView}
            disabled={nodes.length === 0}
            className="flex items-center gap-2 text-sm rounded-md disabled:opacity-50 hover:opacity-80"
            style={{ background: '#EBE3D5', border: '1px solid #D9CDBF', color: '#3E2723', padding: '8px 16px' }}
          >
            <ZoomIn className="h-4 w-4" />
            Fit
          </button>

          <button
            onClick={handleGeneratePreview}
            disabled={nodes.length === 0 || isExporting}
            className="flex items-center gap-2 text-sm rounded-md disabled:opacity-50 hover:opacity-90"
            style={{ background: '#9B8F5E', border: '1px solid #9B8F5E', color: '#FFFFFF', padding: '8px 16px' }}
            title="Download an image of the current diagram"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImageDown className="h-4 w-4" />
            )}
            {isExporting ? 'Rendering…' : 'Download image'}
          </button>
        </div>
      </div>

      {/* ReactFlow Canvas */}
      <div className="flex-1 relative" style={{ background: '#F5EFE7' }}>
        {isLoading && (
          <div
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3"
            style={{ background: 'rgba(245,239,231,0.75)', backdropFilter: 'blur(2px)' }}
          >
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: '#9B8F5E' }} />
            <span className="text-sm font-medium" style={{ color: '#8B7355' }}>
              Building diagram…
            </span>
          </div>
        )}
        {error && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50" style={{ maxWidth: 'min(560px, calc(100% - 32px))' }}>
            <div className="rounded-lg text-sm shadow-sm" style={{ background: 'rgba(196, 117, 108, 0.15)', border: '1px solid #C4756C', color: '#C4756C', padding: '12px 16px' }}>
              {onAiFix && (
                <div className="flex items-center justify-between gap-3" style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(196, 117, 108, 0.35)' }}>
                  <span className="font-semibold" style={{ color: '#C4756C' }}>
                    Couldn&apos;t parse this {isSql ? 'SQL' : 'DBML'}
                  </span>
                  <button
                    onClick={handleAiFix}
                    disabled={isFixing}
                    className="flex items-center gap-1.5 rounded-md font-medium disabled:opacity-60 hover:opacity-90 flex-shrink-0"
                    style={{ background: '#9B8F5E', color: '#FFFFFF', padding: '5px 10px', fontSize: '12px' }}
                    title={
                      aiFixEnabled
                        ? 'Send this schema to the AI assistant and get a parser-friendly version back'
                        : 'Add a Gemini API key in your account settings to enable this'
                    }
                  >
                    {isFixing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {isFixing ? 'Fixing…' : 'Fix Error'}
                  </button>
                </div>
              )}
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '160px', overflowY: 'auto' }}>
                {error}
              </div>
              {fixError && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#8B3A2F' }}>
                  {fixError}
                </div>
              )}
            </div>
          </div>
        )}
        {lockWarning && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50">
            <div className="rounded-lg text-sm shadow-sm" style={{ background: 'rgba(158, 142, 88, 0.15)', border: '1px solid #9E8E58', color: '#9E8E58', padding: '12px 20px' }}>
              Canvas is locked
            </div>
          </div>
        )}

        {editable && armedField && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50">
            <div
              className="rounded-lg text-sm shadow-sm flex items-center gap-2"
              style={{ background: '#FFFFFF', border: '1px solid #9B8F5E', color: '#3E2723', padding: '10px 16px' }}
            >
              <span
                className="rounded-full"
                style={{ width: 9, height: 9, background: '#9B8F5E', border: '2px solid #FFFFFF', boxShadow: '0 0 0 1px #9B8F5E' }}
              />
              Drag from <strong>{armedField.table}.{armedField.column}</strong> onto another field to add a foreign key
              <button
                onClick={() => setArmedField(null)}
                className="rounded hover:opacity-70"
                style={{ padding: '2px', marginLeft: '4px' }}
              >
                <X className="h-3.5 w-3.5" style={{ color: '#8B7355' }} />
              </button>
            </div>
          </div>
        )}

        {editable && connectToast && (
          <div className="absolute z-50" style={{ bottom: '16px', left: '50%', transform: 'translateX(-50%)' }}>
            <div className="rounded-lg text-sm shadow-md" style={{ background: '#3E2723', color: '#F5EFE7', padding: '10px 16px' }}>
              {connectToast}
            </div>
          </div>
        )}

        {/* Diagram image export: error toast */}
        {exportError && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50">
            <div
              className="rounded-lg text-sm shadow-sm"
              style={{ background: 'rgba(196, 117, 108, 0.15)', border: '1px solid #C4756C', color: '#C4756C', padding: '12px 20px' }}
            >
              {exportError}
            </div>
          </div>
        )}

        {/* Diagram image export: download preview */}
        {exportPreview && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(62,39,35,0.35)', padding: '32px' }}
            onClick={() => setExportPreview(null)}
          >
            <div
              className="rounded-lg shadow-xl flex flex-col"
              style={{ background: '#FFFFFF', border: '1px solid #D9CDBF', maxWidth: '900px', maxHeight: '100%', width: '100%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex items-center justify-between"
                style={{ padding: '14px 18px', borderBottom: '1px solid #D9CDBF' }}
              >
                <div className="flex items-center gap-2">
                  <ImageDown className="h-4 w-4" style={{ color: '#9B8F5E' }} />
                  <span className="text-sm font-semibold" style={{ color: '#3E2723' }}>
                    Download preview
                  </span>
                </div>
                <button
                  onClick={() => setExportPreview(null)}
                  className="rounded hover:opacity-70"
                  style={{ padding: '2px' }}
                >
                  <X className="h-4 w-4" style={{ color: '#8B7355' }} />
                </button>
              </div>

              <div
                className="flex-1 overflow-auto"
                style={{ padding: '18px', background: '#F5EFE7' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={exportPreview}
                  alt="Diagram preview"
                  style={{
                    display: 'block',
                    margin: '0 auto',
                    maxWidth: '100%',
                    border: '1px solid #D9CDBF',
                    borderRadius: '6px',
                    background: '#F5EFE7',
                  }}
                />
              </div>

              <div
                className="flex items-center justify-between gap-3"
                style={{ padding: '14px 18px', borderTop: '1px solid #D9CDBF' }}
              >
                <span className="text-xs" style={{ color: '#8B7355' }}>
                  Captures the current table arrangement · {baseFileName}.png
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setExportPreview(null)}
                    className="text-sm rounded-md hover:opacity-80"
                    style={{ background: '#EBE3D5', color: '#3E2723', padding: '8px 16px' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDownloadImage}
                    className="flex items-center gap-2 text-sm rounded-md hover:opacity-90"
                    style={{ background: '#9B8F5E', color: '#FFFFFF', padding: '8px 16px' }}
                  >
                    <Download className="h-4 w-4" />
                    Download image
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add column modal */}
        {editable && addColumnFor && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(62,39,35,0.25)' }}
            onClick={() => setAddColumnFor(null)}
          >
            <div
              className="rounded-lg shadow-xl"
              style={{ background: '#FFFFFF', border: '1px solid #D9CDBF', padding: '18px', minWidth: '320px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4" style={{ color: '#9B8F5E' }} />
                  <span className="text-sm font-semibold" style={{ color: '#3E2723' }}>
                    Add row to {addColumnFor}
                  </span>
                </div>
                <button
                  onClick={() => setAddColumnFor(null)}
                  className="rounded hover:opacity-70"
                  style={{ padding: '2px' }}
                >
                  <X className="h-4 w-4" style={{ color: '#8B7355' }} />
                </button>
              </div>
              <label className="text-xs font-medium block mb-1" style={{ color: '#8B7355' }}>
                Column name
              </label>
              <input
                autoFocus
                type="text"
                value={newColumnName}
                onChange={(e) => { setNewColumnName(e.target.value); setEditError(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddColumn();
                  if (e.key === 'Escape') setAddColumnFor(null);
                }}
                placeholder="column_name"
                className="w-full text-sm rounded-md focus:outline-none mb-3"
                style={{ background: '#F5EEE5', border: '1px solid #D9CDBF', color: '#3E2723', padding: '7px 10px' }}
              />
              <label className="text-xs font-medium block mb-1" style={{ color: '#8B7355' }}>
                Type
              </label>
              <input
                type="text"
                value={newColumnType}
                onChange={(e) => { setNewColumnType(e.target.value); setEditError(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddColumn();
                  if (e.key === 'Escape') setAddColumnFor(null);
                }}
                placeholder={isSql ? 'text' : 'varchar'}
                className="w-full text-sm rounded-md focus:outline-none"
                style={{ background: '#F5EEE5', border: '1px solid #D9CDBF', color: '#3E2723', padding: '7px 10px' }}
              />
              {editError && (
                <div className="text-xs mt-2" style={{ color: '#C4756C' }}>{editError}</div>
              )}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setAddColumnFor(null)}
                  className="flex-1 text-sm rounded-md hover:opacity-80"
                  style={{ background: '#EBE3D5', color: '#3E2723', padding: '8px 12px' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddColumn}
                  disabled={!newColumnName.trim()}
                  className="flex-1 text-sm rounded-md disabled:opacity-50 hover:opacity-90"
                  style={{ background: '#9B8F5E', color: '#FFFFFF', padding: '8px 12px' }}
                >
                  Add row
                </button>
              </div>
            </div>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={editable ? handleConnect : undefined}
          connectionLineStyle={{ stroke: "#9B8F5E", strokeWidth: 2 }}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.1, maxZoom: 1 }}
          minZoom={0.05}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          panOnDrag={isInteractive}
          zoomOnScroll={isInteractive}
          zoomOnPinch={isInteractive}
          zoomOnDoubleClick={false}
          nodesDraggable={isInteractive}
          nodesConnectable={isInteractive}
          elementsSelectable={isInteractive}
          onPaneClick={() => {
            handleLockedInteraction();
            setArmedField(null);
          }}
          onPaneMouseMove={!isInteractive ? handleLockedInteraction : undefined}
        >
          <Background color="#D9CDBF" gap={16} size={1} />
          
          <Panel position="bottom-right" style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
            <Controls 
              style={{ 
                background: '#E8DFD0', 
                border: '1px solid #D9CDBF',
                borderRadius: '8px',
                position: 'static',
              }}
              onInteractiveChange={(interactive) => setIsInteractive(interactive)}
            />
            <div
              className="rounded-lg shadow-sm"
              style={{ background: '#E8DFD0', border: '1px solid #D9CDBF', padding: '10px 16px' }}
            >
              <div className="text-xs font-medium" style={{ color: '#8B7355' }}>
                Tables: {nodes.length} | Relations: {edges.length}
              </div>
            </div>
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}

// Wrapper component with ReactFlowProvider
export default function DBViewer(props: DBViewerProps) {
  return (
    <ReactFlowProvider>
      <DBViewerInner {...props} />
    </ReactFlowProvider>
  );
}
