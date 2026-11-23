#!/usr/bin/env python3
"""Free bounded readiness probe. Never authenticates, mints or generates audio."""
import time,urllib.request,urllib.error,sys
url='https://ajyalalmaerifa.com/functions/v1/ai-tutor-token'
deadline=time.monotonic()+35
while time.monotonic()<deadline:
 try:
  with urllib.request.urlopen(urllib.request.Request(url,data=b'{}',headers={'Content-Type':'application/json'}),timeout=4) as r:status=r.status
 except urllib.error.HTTPError as e:status=e.code
 except Exception:status=0
 if status==401:
  print('EDGE_READY_ANONYMOUS_401');sys.exit(0)
 if status not in [0,502,503,504]:
  print('EDGE_READINESS_UNEXPECTED',status);sys.exit(1)
 time.sleep(1)
print('EDGE_READINESS_TIMEOUT');sys.exit(1)
