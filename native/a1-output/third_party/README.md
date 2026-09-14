# Third-party interfaces

`VoicemeeterRemote.h` is the official VB-Audio header from:
https://github.com/vburel2018/Voicemeeter-SDK

Retrieved from the `main` branch, whose HEAD was
`02a1abf15358ddb33e588cd31c43576a065f81ac` on 2026-09-13.
Original copyright notices are retained. API usage and example-code terms:
https://download.vb-audio.com/Download_CABLE/VoicemeeterRemoteAPI.pdf (page 5).
The installed Voicemeeter runtime remains separately licensed.

`src/ndi.hpp` declares only the public Windows x64 C ABI used by this program,
based on the NDI documentation. No NDI implementation, codec, DLL, or installer
is redistributed. The locally installed NDI runtime is loaded dynamically.

- https://docs.ndi.video/all/developing-with-ndi/sdk/frame-types
- https://docs.ndi.video/all/developing-with-ndi/sdk/ndi-send

This project currently sends NDI High Bandwidth, not NDI HX.

The OBS module is built against the official OBS Studio 32.0.1 headers.
OBS is licensed under GPL-2.0-or-later; its license is retained in
`obs-plugin/COPYING`. The OBS-linked plugin must be distributed in compliance
with those terms, with corresponding source. It is not an MIT-only binary.
The Windows package includes this module's sources and reproducible build scripts;
the pinned official header archive is retrieved and hash-verified by the build script.
OBS itself, NDI and Voicemeeter runtime DLLs are not bundled.
