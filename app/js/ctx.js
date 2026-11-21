// Shared app context, filled by main.js at startup before any feature's init(ctx) runs:
//   pet, detector, store {get, set}, settings, saveSettings(),
//   getModel() -> MLP | null, setModel(mlp, source = 'local') (saves it, makes it live, emits model:changed),
//   getDataset() -> [{f, label}], addData(rows),
//   toast(msg, ms), bubble(msg, ms), say(text), chirp(name), vibrate(pattern),
//   showTab(name) (unhides the nav button for tab-<name>), openTab(name), render() (refresh the status UI),
//   deviceId (random id made once, the only identity that ever leaves the phone).
export const ctx = {};
