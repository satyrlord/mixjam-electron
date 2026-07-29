# Data and Configuration Slop

Compare each file with its schema, loader, and current sibling entries before you edit it.

- Remove placeholder values from live data.
- Remove a key that the consuming schema does not support.
- Combine duplicate entries that have no behavioral difference.
- Correct nesting that conflicts with the sibling shape.
- Correct a path, URL, identifier, or package name that does not resolve.
- Use the owned configuration path for an environment-specific value.
- If a default field records an override, stabilizes serialization, or satisfies a schema, keep it.

Validate edited data with its parser, schema check, or narrowest consumer test.
