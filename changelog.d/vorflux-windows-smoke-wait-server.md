**The Windows smoke check waits for its local page before `/browse` opens it.** The `/browse` step started its page server in the background and ran `goto` at once, so a page server that bound late failed the step as a refused navigation and the misleading "chain output lacks the page text". The step now polls the page for up to 20 s first and names the failure when the server exits or never answers.

### For contributors
- **`.github/workflows/windows-smoke.yml`:** the `/browse` step polls `http://127.0.0.1:47124/` with `curl` before `browse chain`. Locally, a page server 0.5 to 8 s late failed the old step 8 of 8 times with `net::ERR_CONNECTION_REFUSED` and passed the new step 13 of 13 times. The wait costs at most one 0.2 s poll on a healthy run.
- `test/windows-native-workflows.test.ts`: the poll sits after the page server starts and before `browse chain`.
