# Data Management

<cite>
**Referenced Files in This Document**
- [data-model.md](file://docs/data-model.md)
- [indexing.md](file://docs/indexing.md)
- [query-schema.md](file://docs/query-schema.md)
- [db.ts](file://src/main/db.ts)
- [library.ts](file://src/main/library.ts)
- [indexer.ts](file://src/main/indexer.ts)
- [indexer-host.ts](file://src/main/indexer-host.ts)
- [session.ts](file://src/main/session.ts)
- [sample-browser.ts](file://src/main/sample-browser.ts)
- [index.ts](file://src/main/index.ts)
- [ipc.ts](file://src/shared/ipc.ts)
- [path-utils.ts](file://src/main/path-utils.ts)
- [package.json](file://package.json)
</cite>

## Update Summary
**Changes Made**
- Updated database schema documentation to reflect the centralized AUDIO_EXTENSIONS constant in path utilities
- Enhanced migration documentation with improved category_id column addition process
- Added documentation for the new hasSamples() function in library management system
- Updated file system integration patterns to show centralized extension handling
- Enhanced IPC communication patterns with hasSamples() integration

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)
10. [Appendices](#appendices)

## Introduction
This document describes MixJam Electron's comprehensive SQLite-based library management system with detailed coverage of the database schema, entity relationships, indexing strategies, advanced querying capabilities, and operational patterns for large-scale audio sample libraries. The system implements a robust two-phase scanning pipeline, sophisticated category management, and efficient IPC communication between processes. Recent improvements include centralized audio file extension handling and enhanced database migration support.

## Project Structure
The data management system is organized around a centralized SQLite database with dedicated modules for database operations, library management, indexing, and IPC communication. The main process coordinates database operations while the renderer consumes data through well-defined IPC channels. Audio file extensions are now centrally managed in path utilities for consistent scanning across all components.

```mermaid
graph TB
subgraph "Database Layer"
DB["src/main/db.ts<br/>Schema Definition & Migration"]
LIB["src/main/library.ts<br/>CRUD Operations & Queries<br/>hasSamples() Function"]
END
subgraph "Indexing Layer"
IDX["src/main/indexer.ts<br/>Worker Thread Implementation<br/>AUDIO_EXTENSIONS Integration"]
HOST["src/main/indexer-host.ts<br/>Process Coordination"]
PATH["src/main/path-utils.ts<br/>Centralized AUDIO_EXTENSIONS<br/>Path Utilities"]
END
subgraph "Main Process"
MAIN["src/main/index.ts<br/>IPC Handlers & Orchestration<br/>hasSamples() Integration"]
SES["src/main/session.ts<br/>Session Management"]
END
subgraph "Renderer"
IPC["src/shared/ipc.ts<br/>Type Definitions<br/>hasSamples() Channel"]
SB["src/main/sample-browser.ts<br/>Local Folder Scanner<br/>AUDIO_EXTENSIONS Integration"]
PRELOAD["src/preload/index.ts<br/>hasSamples() Bridge"]
RENDERER["src/renderer/src/hooks/useLibraryData.ts<br/>hasSamples() Usage"]
END
DB --> LIB
LIB --> MAIN
IDX --> PATH
IDX --> HOST
PATH --> SB
MAIN --> PRELOAD
PRELOAD --> RENDERER
SES --> MAIN
IPC --> MAIN
SB --> MAIN
```

**Diagram sources**
- [db.ts](file://src/main/db.ts)
- [library.ts](file://src/main/library.ts)
- [indexer.ts](file://src/main/indexer.ts)
- [indexer-host.ts](file://src/main/indexer-host.ts)
- [index.ts](file://src/main/index.ts)
- [ipc.ts](file://src/shared/ipc.ts)
- [sample-browser.ts](file://src/main/sample-browser.ts)
- [path-utils.ts](file://src/main/path-utils.ts)
- [preload/index.ts](file://src/preload/index.ts)
- [renderer/src/hooks/useLibraryData.ts](file://src/renderer/src/hooks/useLibraryData.ts)

**Section sources**
- [db.ts](file://src/main/db.ts)
- [library.ts](file://src/main/library.ts)
- [indexer.ts](file://src/main/indexer.ts)
- [indexer-host.ts](file://src/main/indexer-host.ts)
- [index.ts](file://src/main/index.ts)
- [ipc.ts](file://src/shared/ipc.ts)
- [sample-browser.ts](file://src/main/sample-browser.ts)
- [path-utils.ts](file://src/main/path-utils.ts)
- [preload/index.ts](file://src/preload/index.ts)
- [renderer/src/hooks/useLibraryData.ts](file://src/renderer/src/hooks/useLibraryData.ts)

## Core Components
The system consists of several interconnected components that work together to provide efficient audio sample library management:

- **Central SQLite Database**: Owned by the main process with WAL mode enabled for concurrent read/write operations
- **Master Index**: Compact, denormalized index of files with minimal duplication and change-detection via mtime/size
- **Category Management**: Hierarchical category system with automatic assignment based on file paths
- **Advanced Query Engine**: Comprehensive filtering system supporting tags, categories, numeric ranges, and text search
- **Two-Phase Scanning**: Fast initial indexing followed by background metadata extraction
- **FTS5 Text Search**: Full-text search capabilities synchronized with database triggers
- **IPC Communication**: Well-defined channels for renderer-main process interaction
- **Centralized Audio Extensions**: Unified audio file extension handling across all scanning components

**Section sources**
- [db.ts](file://src/main/db.ts)
- [library.ts](file://src/main/library.ts)
- [indexer.ts](file://src/main/indexer.ts)
- [index.ts](file://src/main/index.ts)
- [path-utils.ts](file://src/main/path-utils.ts)

## Architecture Overview
The system employs a multi-process architecture with clear separation of concerns and centralized audio file extension management:

- **Main Process**: Owns the database, manages IPC handlers, coordinates scanning operations, and provides hasSamples() functionality
- **Worker Thread**: Performs filesystem operations and metadata extraction without blocking the UI, using centralized AUDIO_EXTENSIONS
- **Renderer Process**: Requests data through IPC channels and displays results, utilizing hasSamples() for UI state management
- **Database Layer**: Provides ACID-compliant storage with foreign key constraints and triggers
- **Path Utilities**: Centralized management of audio file extensions for consistent scanning across all components

```mermaid
sequenceDiagram
participant R as "Renderer"
participant P as "Preload Bridge"
participant M as "Main Process"
participant W as "Indexer Worker"
participant U as "Path Utils"
participant DB as "SQLite DB"
R->>P : "hasSamples()"
P->>M : "IPC : libraryHasSamples"
M->>DB : "SELECT 1 FROM samples LIMIT 1"
DB-->>M : "Row exists or not"
M-->>P : "Boolean result"
P-->>R : "Database indexed flag"
R->>M : "Start scan(sampleFolder)"
M->>U : "Import AUDIO_EXTENSIONS"
U-->>M : "Set of supported extensions"
M->>W : "Spawn worker with {dbPath, sampleFolder}"
W->>DB : "Phase 1 : Batched stub insertion"
W->>U : "Check file extensions"
U-->>W : "Extension validation"
W-->>M : "Progress events (phase 1)"
M-->>R : "Scan progress updates"
W->>DB : "Phase 2 : Metadata extraction"
W-->>M : "Progress events (phase 2)"
M-->>R : "Final scan complete"
R->>M : "Query samples with filters"
M->>DB : "Execute parameterized query"
DB-->>M : "Results with counts"
M-->>R : "Filtered sample list"
```

**Diagram sources**
- [indexer.ts](file://src/main/indexer.ts)
- [indexer-host.ts](file://src/main/indexer-host.ts)
- [index.ts](file://src/main/index.ts)
- [path-utils.ts](file://src/main/path-utils.ts)
- [preload/index.ts](file://src/preload/index.ts)
- [renderer/src/hooks/useLibraryData.ts](file://src/renderer/src/hooks/useLibraryData.ts)

**Section sources**
- [indexer.ts](file://src/main/indexer.ts)
- [indexer-host.ts](file://src/main/indexer-host.ts)
- [index.ts](file://src/main/index.ts)
- [path-utils.ts](file://src/main/path-utils.ts)
- [preload/index.ts](file://src/preload/index.ts)
- [renderer/src/hooks/useLibraryData.ts](file://src/renderer/src/hooks/useLibraryData.ts)

## Detailed Component Analysis

### Database Schema and Migration System
The SQLite database implements a comprehensive schema designed for efficient audio sample management with built-in migration support and enhanced category management:

```mermaid
erDiagram
SAMPLES {
integer id PK
text filepath UK
text filename
text ext
integer size_bytes
integer mtime
float duration
integer sample_rate
integer channels
float bpm
text musical_key
integer date_added
integer scan_state
integer category_id FK
}
TAGS {
integer id PK
text name UK
text color
}
SAMPLE_TAGS {
integer sample_id PK,FK
integer tag_id PK,FK
}
CATEGORIES {
integer id PK
text name
integer parent_id FK
}
SAMPLE_CATEGORIES {
integer sample_id PK,FK
integer category_id PK,FK
}
LIBRARIES {
integer id PK
text name
integer created_at
}
LIBRARY_RULES {
integer library_id PK,UK,FK
text rule_json
}
SCAN_ROOTS {
integer id PK
text path UK
integer last_scanned
}
SAMPLES ||--o{ SAMPLE_TAGS : "has"
TAGS ||--o{ SAMPLE_TAGS : "has"
SAMPLES ||--o{ SAMPLE_CATEGORIES : "belongs_to"
CATEGORIES ||--o{ SAMPLE_CATEGORIES : "contains"
LIBRARIES ||--|| LIBRARY_RULES : "defines"
```

**Diagram sources**
- [db.ts](file://src/main/db.ts)

Key schema characteristics:
- **Unique Filepath Constraint**: Prevents duplicate entries by absolute path
- **Enhanced Category System**: Added category_id column in v2 migration for hierarchical organization with improved foreign key constraints
- **Foreign Key Constraints**: Enabled per connection with cascading deletes for referential integrity
- **Scan State Management**: Three-state system (0=stub, 1=metadata-extracted, 2=missing) for efficient filtering
- **Migration Support**: Version-gated schema evolution with backward compatibility and centralized migration logic

**Updated** Enhanced migration documentation to reflect improved category_id column addition process and centralized extension handling.

**Section sources**
- [db.ts](file://src/main/db.ts)
- [data-model.md](file://docs/data-model.md)

### Advanced Indexing and Query System
The library management system implements sophisticated indexing strategies and query capabilities with centralized audio file extension handling:

#### Indexing Strategy
- **Primary Indexes**: Filename, date_added, bpm, musical_key for common filtering operations
- **Join Indexes**: Tag and category join tables indexed by referenced side for efficient joins
- **Category Tree Index**: Parent_id indexed for recursive CTE operations
- **FTS5 Virtual Table**: External content synchronized via triggers for fuzzy text search

#### Query Capabilities
The query engine supports comprehensive filtering through parameterized SQL with enhanced extension validation:

- **Text Search**: FTS5 MATCH subqueries with prefix matching
- **Numeric Ranges**: BPM and duration filtering with inclusive bounds
- **Category Filtering**: Single categories or entire subtree queries via recursive CTE
- **Tag Management**: Any/all/none combinations with EXISTS/HAVING patterns
- **Musical Key Membership**: Set-based filtering for key signatures
- **Date Filtering**: Absolute and relative time windows

#### Centralized Extension Handling
Audio file extensions are now centrally managed through the AUDIO_EXTENSIONS constant, ensuring consistent scanning across all components:

- **Indexer Integration**: Worker threads import AUDIO_EXTENSIONS for file validation
- **Legacy Browser Integration**: Sample browser uses AUDIO_EXTENSIONS for local folder scanning
- **Consistent Validation**: All scanning components use the same extension set for reliability

**Section sources**
- [db.ts](file://src/main/db.ts)
- [library.ts](file://src/main/library.ts)
- [query-schema.md](file://docs/query-schema.md)
- [path-utils.ts](file://src/main/path-utils.ts)
- [indexer.ts](file://src/main/indexer.ts)
- [sample-browser.ts](file://src/main/sample-browser.ts)

### Two-Phase Scanning Pipeline
The system implements an efficient two-phase scanning process with centralized audio extension validation to ensure responsive user experience:

#### Phase 1: Fast Stub Creation
- **Batch Processing**: 500-file batches for optimal performance
- **Initial Population**: Creates stub records with basic file information using centralized extension validation
- **Immediate Usability**: Users can browse and filter by name/path immediately
- **Category Assignment**: Automatic assignment based on folder structure with enhanced validation

#### Phase 2: Background Metadata Extraction
- **Selective Processing**: Only processes stub records (scan_state = 0) with extension verification
- **Header Parsing**: Extracts duration, sample rate, and channel information
- **Incremental Updates**: Can be paused/resumed without data loss
- **Low Priority**: Runs at reduced priority to avoid UI interference

#### Change Detection and Resumption
- **mtime/size Tracking**: Reliable change detection mechanism
- **Incremental Updates**: Preserves user modifications during re-scan
- **Missing File Handling**: Marks deleted files as missing rather than hard-deleting
- **Transaction Isolation**: Independent batch transactions enable clean resumption

**Section sources**
- [indexer.ts](file://src/main/indexer.ts)
- [indexing.md](file://docs/indexing.md)
- [path-utils.ts](file://src/main/path-utils.ts)

### IPC Communication and Process Synchronization
The system uses well-defined IPC channels for seamless communication between processes with enhanced database state management:

#### Main Process IPC Handlers
- **Library Operations**: CRUD operations for tags, categories, and libraries
- **Query Execution**: Parameterized sample queries with pagination
- **Scan Control**: Start, monitor, and coordinate scanning operations
- **Session Management**: User and sample folder configuration persistence
- **Database State**: hasSamples() function for UI state management

#### Renderer Integration
- **Type Safety**: Strongly typed IPC channels prevent runtime errors
- **Progress Events**: Real-time scanning progress updates
- **Error Handling**: Graceful error propagation with meaningful messages
- **Resource Management**: Proper cleanup on application shutdown
- **State Management**: hasSamples() integration for conditional UI rendering

#### hasSamples() Function Integration
The new hasSamples() function provides critical database state information for UI decision-making:

- **Lightweight Check**: Simple database query to determine if samples exist
- **UI Switching**: Enables transition from legacy folder browser to indexed DB browser
- **Conditional Rendering**: Prevents unnecessary heavy queries when database is empty
- **Performance Optimization**: Reduces renderer complexity by centralizing state checking

**Section sources**
- [index.ts](file://src/main/index.ts)
- [ipc.ts](file://src/shared/ipc.ts)
- [preload/index.ts](file://src/preload/index.ts)
- [renderer/src/hooks/useLibraryData.ts](file://src/renderer/src/hooks/useLibraryData.ts)

### Category Management System
The hierarchical category system provides flexible organization for audio samples with enhanced automation:

#### Automatic Category Creation
- **Root Categories**: Derived from sample folder structure (excluding "Unsorted")
- **Subcategory Support**: Nested categories for deep organizational hierarchies
- **Fallback Mechanism**: "Unsorted" category for files outside organized folders
- **Consistency**: Ensures category existence before assignment

#### Path-Based Assignment
- **Relative Path Analysis**: Determines category based on folder structure
- **Hierarchical Mapping**: Creates parent-child relationships automatically
- **Membership Tracking**: Maintains both primary and secondary category memberships
- **Update Safety**: Clears stale memberships during re-scan operations

**Section sources**
- [library.ts](file://src/main/library.ts)
- [indexer.ts](file://src/main/indexer.ts)

## Dependency Analysis
The system exhibits clear dependency relationships that support maintainability and scalability with centralized extension management:

```mermaid
graph LR
R["Renderer"] --> P["Preload Bridge"]
P --> M["Main Process"]
M --> DB["Database Layer"]
M --> IDX["Indexing Layer"]
M --> IPC["IPC Layer"]
DB --> LIB["Library Module"]
LIB --> DB
LIB --> HS["hasSamples() Function"]
IDX --> PATH["Path Utils"]
IDX --> FS["File System"]
PATH --> SB["Sample Browser"]
PATH --> IDX
FS --> IDX
IPC --> R
IPC --> M
P --> R
```

**Diagram sources**
- [index.ts](file://src/main/index.ts)
- [db.ts](file://src/main/db.ts)
- [library.ts](file://src/main/library.ts)
- [indexer.ts](file://src/main/indexer.ts)
- [path-utils.ts](file://src/main/path-utils.ts)
- [preload/index.ts](file://src/preload/index.ts)
- [renderer/src/hooks/useLibraryData.ts](file://src/renderer/src/hooks/useLibraryData.ts)

**Section sources**
- [index.ts](file://src/main/index.ts)
- [db.ts](file://src/main/db.ts)
- [library.ts](file://src/main/library.ts)
- [indexer.ts](file://src/main/indexer.ts)
- [path-utils.ts](file://src/main/path-utils.ts)
- [preload/index.ts](file://src/preload/index.ts)
- [renderer/src/hooks/useLibraryData.ts](file://src/renderer/src/hooks/useLibraryData.ts)

## Performance Considerations
The system implements several optimization strategies for handling large audio libraries with enhanced extension handling:

### Database Optimizations
- **WAL Mode**: Enables concurrent read/write operations without blocking
- **Targeted Indexes**: Essential indexes for common filtering operations
- **Parameterized Queries**: Prevents SQL injection and query plan caching
- **Batch Transactions**: Reduces transaction overhead for bulk operations

### Memory Management
- **Streaming Results**: Pagination prevents memory bloat for large result sets
- **Lazy Loading**: Metadata extraction deferred until needed
- **Weak References**: Proper cleanup of worker threads and database connections
- **Garbage Collection**: Strategic cleanup during application shutdown

### Network and File System
- **Local File Access**: Direct file system access minimizes network overhead
- **Efficient Walking**: Optimized directory traversal algorithms
- **Concurrent Operations**: Parallel processing reduces overall scan time
- **Resource Limits**: Configurable batch sizes prevent memory exhaustion

### Centralized Extension Management
- **Single Source of Truth**: AUDIO_EXTENSIONS constant ensures consistency across all components
- **Reduced Memory Footprint**: Centralized set avoids duplicate extension arrays
- **Maintainability**: Single place to update supported audio formats
- **Performance**: Efficient Set-based lookups for file extension validation

## Troubleshooting Guide
Common issues and their solutions with enhanced database state management:

### Database Issues
- **Slow Queries**: Verify essential indexes exist and are being used effectively
- **Lock Conflicts**: Ensure WAL mode is active and no long-running transactions block updates
- **Migration Failures**: Check schema version and run migration steps in order
- **Connection Problems**: Verify database file permissions and path resolution

### Scanning Problems
- **Incomplete Scans**: Check worker thread health and batch processing logs
- **Missing Files**: Verify file system accessibility and path canonicalization
- **Stuck Progress**: Monitor for long-running transactions or blocked operations
- **Memory Usage**: Adjust batch sizes and monitor worker thread memory consumption

### Query Performance
- **Slow Filters**: Analyze query execution plans and add missing indexes
- **Large Result Sets**: Implement pagination and optimize WHERE clauses
- **Text Search Issues**: Verify FTS5 virtual table synchronization
- **Category Queries**: Check recursive CTE performance with large hierarchies

### IPC Communication
- **Lost Messages**: Verify event listener registration and worker thread lifecycle
- **Serialization Errors**: Check IPC payload types and serialization boundaries
- **Permission Issues**: Ensure proper file system access for sample folder operations
- **Cleanup Problems**: Verify proper worker thread termination and resource release

### hasSamples() Function Issues
- **False Positives/Negatives**: Verify database connectivity and query execution
- **Performance Bottlenecks**: Monitor database query performance for large libraries
- **UI State Inconsistencies**: Ensure proper integration with renderer state management
- **Error Propagation**: Check error handling in preload bridge and renderer integration

**Section sources**
- [db.ts](file://src/main/db.ts)
- [library.ts](file://src/main/library.ts)
- [indexer.ts](file://src/main/indexer.ts)
- [indexing.md](file://docs/indexing.md)
- [renderer/src/hooks/useLibraryData.ts](file://src/renderer/src/hooks/useLibraryData.ts)

## Conclusion
MixJam Electron's SQLite-based library management system provides a robust foundation for audio sample organization with excellent performance characteristics and scalability. The combination of sophisticated indexing, efficient two-phase scanning, comprehensive query capabilities, and well-designed IPC communication creates a responsive and reliable user experience. Recent improvements including centralized audio extension management and the hasSamples() function enhance maintainability, consistency, and user experience. The system's modular architecture supports future enhancements while maintaining backward compatibility and operational stability.

## Appendices

### A. Database Initialization and Migration
The system implements a structured approach to database initialization and schema evolution with enhanced migration support:

#### Schema Versioning
- **Version Gating**: Migration steps execute only when schema version requires updates
- **Backward Compatibility**: Previous versions remain functional during upgrades
- **Atomic Operations**: Migration steps are designed to be idempotent and safe

#### Initialization Sequence
1. Database file creation in user data directory
2. Schema version table establishment
3. Initial DDL execution with foreign key enforcement
4. Migration step execution for current version with enhanced category_id handling
5. Trigger and index creation for performance optimization

**Updated** Enhanced migration documentation to reflect improved category_id column addition process and centralized extension handling.

**Section sources**
- [db.ts](file://src/main/db.ts)

### B. Query Engine Implementation Details
The query engine provides comprehensive filtering capabilities through parameterized SQL with enhanced extension validation:

#### Filter Composition
- **Group Logic**: AND/OR/NOT combinations with proper precedence handling
- **Leaf Conditions**: Individual filter types with validation and transformation
- **Parameter Binding**: Safe parameter binding prevents SQL injection
- **Execution Planning**: Efficient query plan generation for complex filter combinations

#### Performance Optimizations
- **Index Utilization**: Strategic use of available indexes for filter acceleration
- **Query Simplification**: Complex filter trees simplified to minimal SQL
- **Pagination Support**: Built-in LIMIT/OFFSET for large result sets
- **Count Optimization**: Separate COUNT queries for efficient pagination

**Section sources**
- [library.ts](file://src/main/library.ts)
- [query-schema.md](file://docs/query-schema.md)

### C. hasSamples() Function Implementation
The new hasSamples() function provides critical database state information for UI decision-making:

#### Function Purpose
- **Database State Check**: Lightweight query to determine if at least one sample exists
- **UI State Management**: Enables conditional rendering between legacy and indexed browsers
- **Performance Optimization**: Reduces unnecessary heavy queries when database is empty

#### Implementation Details
- **Simple Query**: SELECT 1 FROM samples LIMIT 1 for minimal overhead
- **Boolean Return**: Direct conversion of query result to boolean value
- **IPC Integration**: Available through preload bridge for renderer access
- **Error Handling**: Graceful handling of database connection issues

#### Usage Patterns
- **Renderer Integration**: Used in useLibraryData hook for conditional UI switching
- **Mount/Unmount Logic**: Called on component mount and after scan completion
- **Error Recovery**: Falls back to legacy browser when database state cannot be determined

**Section sources**
- [library.ts](file://src/main/library.ts)
- [index.ts](file://src/main/index.ts)
- [preload/index.ts](file://src/preload/index.ts)
- [renderer/src/hooks/useLibraryData.ts](file://src/renderer/src/hooks/useLibraryData.ts)

### D. Centralized Audio Extension Management
The AUDIO_EXTENSIONS constant provides unified audio file extension handling across all scanning components:

#### Centralization Benefits
- **Consistency**: All scanning components use the same extension validation logic
- **Maintainability**: Single place to update supported audio formats
- **Performance**: Efficient Set-based lookups for file extension validation
- **Reliability**: Reduced risk of inconsistent extension handling between components

#### Integration Points
- **Indexer Worker**: Uses AUDIO_EXTENSIONS for file validation during scanning
- **Legacy Browser**: Integrates AUDIO_EXTENSIONS for local folder scanning
- **Path Utilities**: Central location for extension constants and path utilities
- **Future Expansion**: Easy to add new audio formats by updating single constant

**Section sources**
- [path-utils.ts](file://src/main/path-utils.ts)
- [indexer.ts](file://src/main/indexer.ts)
- [sample-browser.ts](file://src/main/sample-browser.ts)

### E. Example Usage Patterns
Practical examples demonstrating common operations with enhanced database state management:

#### Basic Library Operations
- **Creating Tags**: Idempotent tag creation with color support
- **Category Management**: Hierarchical category organization with automatic assignment
- **Library Creation**: Saved queries with JSON rule definitions
- **Sample Queries**: Filtered browsing with pagination and sorting

#### Advanced Filtering
- **Complex Combinations**: Multi-criteria filters with logical operators
- **Recursive Categories**: Subtree inclusion using recursive CTEs
- **Text Search**: Fuzzy matching with prefix queries
- **Numeric Ranges**: BPM and duration filtering with inclusive bounds

#### hasSamples() Integration
- **UI State Management**: Conditional rendering based on database population
- **Performance Optimization**: Avoiding heavy queries when database is empty
- **User Experience**: Smooth transition between legacy and indexed browsing modes
- **Error Recovery**: Graceful fallback to legacy browser when database state is uncertain

**Section sources**
- [library.ts](file://src/main/library.ts)
- [index.ts](file://src/main/index.ts)
- [renderer/src/hooks/useLibraryData.ts](file://src/renderer/src/hooks/useLibraryData.ts)