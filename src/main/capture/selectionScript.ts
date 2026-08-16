export const SELECTION_CAPTURE_JXA = `ObjC.import("AppKit");
ObjC.import("Foundation");

const initialChangeCount = $.NSPasteboard.generalPasteboard.changeCount;
Application("System Events").keystroke("c", { using: "command down" });

let changed = false;
for (let attempt = 0; attempt < 30; attempt += 1) {
  delay(0.02);
  if ($.NSPasteboard.generalPasteboard.changeCount > initialChangeCount) {
    changed = true;
    break;
  }
}

const statusLine = changed ? "changed\\n" : "timeout\\n";
const statusData = $(statusLine).dataUsingEncoding($.NSUTF8StringEncoding);
$.NSFileHandle.fileHandleWithStandardOutput.writeData(statusData);`;
