const fs = require('fs');
let c = fs.readFileSync('src/ui/views/global.js', 'utf8');

c += `
import { confirmSheet } from "../confirm.js";
import { updateStudySet } from "../../storage/store.js";
import { currentDetail, renderSetDetail } from "./set-detail.js";

export function confirmPublishSet(setId) {
  confirmSheet({
    title: "Make it global",
    desc: "Anyone using Mafsar can see and copy the cards and quiz. Your name and email are never shown, and your progress stays yours.<br><br><b>Don't publish personal or patient details.</b><br><br>You can take it down any time.",
    actionText: "Publish",
    actionClass: "btn-primary",
    onConfirm: async () => {
      toast("Publishing...");
      try {
        await send({ type: "GLOBAL_PUBLISH", setId });
        const { studySet } = currentDetail() || {};
        if (studySet && studySet.id === setId) {
          studySet.published = 1;
          await updateStudySet(studySet);
          renderSetDetail(setId, currentDetail().tab);
        }
        toast("Set published!");
      } catch(e) {
        toast(e.message);
      }
    }
  });
}

export async function unpublishSet(setId) {
  toast("Removing...");
  try {
    await send({ type: "GLOBAL_UNPUBLISH", setId });
    const { studySet } = currentDetail() || {};
    if (studySet && studySet.id === setId) {
      studySet.published = 0;
      await updateStudySet(studySet);
      renderSetDetail(setId, currentDetail().tab);
    }
    toast("Set removed from global.");
  } catch(e) {
    toast(e.message);
  }
}
`;

fs.writeFileSync('src/ui/views/global.js', c);
