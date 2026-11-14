import { model } from "@medusajs/framework/utils"

// SC-1 proof: one table, to show a core module's migration runs from the app.
const CoreProofItem = model.define("core_proof_item", {
  id: model.id().primaryKey(),
  label: model.text(),
})

export default CoreProofItem
