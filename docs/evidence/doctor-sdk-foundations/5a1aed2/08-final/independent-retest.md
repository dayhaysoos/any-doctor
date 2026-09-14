# Independent retest commands

These commands retest the exact checkpoint-8 implementation tarball retained on
this machine. Use fresh directories; the independent runners write their outputs
beside themselves.

```sh
set -eu
REPO=/Users/nickdejesus/Code/any-doctor
EVIDENCE="$REPO/docs/evidence/doctor-sdk-foundations/5a1aed2/08-final"
ARTIFACT=/private/tmp/any-doctor-sdk-final-artifact/any-doctor-0.1.2-bd68ff182ffbef8686d08a1876a183934e94ebf0105ffddee35c3eed65553392.tgz

cd "$REPO"
test "$(git branch --show-current)" = feature/doctor-sdk-foundations
shasum -a 256 "$ARTIFACT"
npm test
node bin/cli.js verify --all
node bin/cli.js verify doctors/async.mjs --format json > /tmp/doctor-sdk-local-profiles.json
node bin/cli.js run doctors/async.mjs /tmp/any-doctor-frozen-sift --format json > /tmp/doctor-sdk-local-sift.json

LOCAL_RUNNERS=$(mktemp -d /tmp/doctor-sdk-local-runners.XXXXXX)
cp "$EVIDENCE/results/challenges.py" "$EVIDENCE/results/degraded.py" "$EVIDENCE/results/degraded-identifiers.py" "$EVIDENCE/results/fresh.py" "$LOCAL_RUNNERS/"
python3 "$LOCAL_RUNNERS/challenges.py" independent-local "$REPO"
python3 "$LOCAL_RUNNERS/fresh.py" independent-local "$REPO"
node dev/async-analysis/check-unavailable.mjs "$REPO" "$LOCAL_RUNNERS/unavailable"

CONSUMER=$(mktemp -d /tmp/doctor-sdk-consumer.XXXXXX)
cd "$CONSUMER"
npm init -y >/dev/null
npm install --ignore-scripts --no-audit --no-fund "$ARTIFACT"
INSTALLED="$CONSUMER/node_modules/any-doctor"
node "$INSTALLED/bin/cli.js" verify --all
node "$INSTALLED/bin/cli.js" verify "$INSTALLED/doctors/async.mjs" --format json > /tmp/doctor-sdk-packed-profiles.json
node "$INSTALLED/bin/cli.js" run "$INSTALLED/doctors/async.mjs" /tmp/any-doctor-frozen-sift --format json > /tmp/doctor-sdk-packed-sift.json

PACKED_RUNNERS=$(mktemp -d /tmp/doctor-sdk-packed-runners.XXXXXX)
cp "$EVIDENCE/results/challenges.py" "$EVIDENCE/results/degraded.py" "$EVIDENCE/results/degraded-identifiers.py" "$EVIDENCE/results/fresh.py" "$PACKED_RUNNERS/"
python3 "$PACKED_RUNNERS/challenges.py" independent-packed "$INSTALLED"
python3 "$PACKED_RUNNERS/fresh.py" independent-packed "$INSTALLED"
node "$REPO/dev/async-analysis/check-unavailable.mjs" "$INSTALLED" "$PACKED_RUNNERS/unavailable"

cmp /tmp/doctor-sdk-local-sift.json /tmp/doctor-sdk-packed-sift.json
node - <<'NODE'
const fs=require('fs'),crypto=require('crypto');
const manifest=require('/Users/nickdejesus/Code/any-doctor/docs/evidence/consumer-analysis/sift-manifest.json');
const root='/tmp/any-doctor-frozen-sift',bad=[];
for(const item of manifest.files){const file=`${root}/${item.file}`;if(!fs.existsSync(file)){bad.push(item.file);continue}const bytes=fs.readFileSync(file);if(bytes.length!==item.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)bad.push(item.file)}
if(bad.length)throw Error(`frozen target drift: ${bad.join(', ')}`);console.log(`frozen integrity: ${manifest.files.length}/${manifest.files.length}`);
NODE
```

Expected machine counts are recorded in `summary.json`. A command exit is not a
substitute for inspecting the independent JSON result rows.
