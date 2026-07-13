# Loudness worklet asset

`loudness.worklet.js` is the unmodified release asset from
`loudness-worklet` version 1.6.9:

- Source: <https://github.com/lcweden/loudness-worklet/releases/download/v1.6.9/loudness.worklet.js>
- SHA-256: `972a36c9f3f84a2520b67cbc61ea2a199e380baae260f91defa9fada264b8a8f`
- License: MIT

The npm dependency is pinned to the same version for its public TypeScript
types and package provenance. MixJam self-hosts the processor asset so the
production Content Security Policy can retain `worker-src 'self'`; the
package's default loader creates a `blob:` URL and is not used.

## MIT License

Copyright (c) 2025 lcweden

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
