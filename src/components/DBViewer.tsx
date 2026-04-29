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
  ReactFlowProvider,
  Panel,
  Handle,
  Position,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Parser, importer } from "@dbml/core";
import {
  Database,
  ZoomIn,
  Eye,
  EyeOff,
  Search,
} from "lucide-react";

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
}

type TableNodeType = Node<TableNodeData, "table">;

interface DBViewerProps {
  dbmlContent: string;
  fileName: string;
  layoutData: string;
  onLayoutChange: (layoutData: string) => void;
  onTableSelect?: (tableName: string) => void;
}

// Custom Table Node Component - Solarized Light theme like Project-Nest
function TableNode({ data }: NodeProps<TableNodeType>) {
  const [isExpanded, setIsExpanded] = useState(true);

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
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="hover:bg-white/20 rounded text-white"
          style={{ padding: '4px' }}
        >
          {isExpanded ? (
            <EyeOff className="h-3 w-3" />
          ) : (
            <Eye className="h-3 w-3" />
          )}
        </button>
      </div>

      {/* Columns */}
      {isExpanded && (
        <div style={{ padding: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {data.columns?.map((column, index) => (
              <div
                key={index}
                className="flex items-center justify-between text-xs rounded"
                style={{ 
                  padding: '5px 8px',
                  background: column.isPrimary ? 'rgba(196, 117, 108, 0.15)' : 
                              column.isForeign ? 'rgba(90, 130, 170, 0.15)' : 
                              'transparent',
                  borderLeft: column.isPrimary ? '3px solid #C4756C' : 
                              column.isForeign ? '3px solid #5A82AA' : 
                              '3px solid transparent'
                }}
              >
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
            ))}
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
function DBViewerInner({ dbmlContent, fileName, layoutData, onLayoutChange, onTableSelect }: DBViewerProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isInteractive, setIsInteractive] = useState(true);
  const [lockWarning, setLockWarning] = useState(false);
  const isRestoring = useRef(false);
  const lockWarningTimeout = useRef<NodeJS.Timeout | null>(null);

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
    const createTableStatements = statements
      .map((stmt) => stmt.trim())
      .filter((stmt) => /^CREATE\s+TABLE\b/i.test(stmt));

    if (createTableStatements.length === 0) return "";
    return createTableStatements.join(";\n\n") + ";";
  };

  const parseDBML = useCallback(
    async (content: string, layout?: string) => {
      if (!content.trim()) return;

      setIsLoading(true);
      setError(null);

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
    [fitView, restoreLayout, setEdges, setNodes, fileName]
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

          <button
            onClick={handleFitView}
            disabled={nodes.length === 0}
            className="flex items-center gap-2 text-sm rounded-md disabled:opacity-50 hover:opacity-80"
            style={{ background: '#EBE3D5', border: '1px solid #D9CDBF', color: '#3E2723', padding: '8px 16px' }}
          >
            <ZoomIn className="h-4 w-4" />
            Fit
          </button>
        </div>
      </div>

      {/* ReactFlow Canvas */}
      <div className="flex-1 relative" style={{ background: '#F5EFE7' }}>
        {error && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50">
            <div className="rounded-lg text-sm shadow-sm" style={{ background: 'rgba(196, 117, 108, 0.15)', border: '1px solid #C4756C', color: '#C4756C', padding: '12px 20px' }}>
              {error}
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

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          panOnDrag={isInteractive}
          zoomOnScroll={isInteractive}
          zoomOnPinch={isInteractive}
          zoomOnDoubleClick={isInteractive}
          nodesDraggable={isInteractive}
          nodesConnectable={isInteractive}
          elementsSelectable={isInteractive}
          onPaneClick={handleLockedInteraction}
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
