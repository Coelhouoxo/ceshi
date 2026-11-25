'use strict';
(() => {
 const byId = id => document.getElementById(id);
 const defaultAvatar = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 112"><rect width="112" height="112" fill="#d0d1dd"/><circle cx="56" cy="41" r="15" fill="#f2f2f7"/><path d="M27 87v-7a29 25 0 0 1 58 0v7Z" fill="#f2f2f7"/></svg>');
 const chevron = '<svg class="mask-card-chevron" viewBox="0 0 10 16" aria-hidden="true"><path d="m2 2 6 6-6 6"/></svg>';
 let editingList = false, selectedId = null, deleteId = null, returnFocus = null, linkRequest = 0;
 const avatar = mask => {const img=document.createElement('img');img.className='mask-card-avatar';img.alt='';img.src=mask?.avatar || defaultAvatar;img.onerror=()=>{img.onerror=null;img.src=defaultAvatar;};return img;};
 function copy(mask, defaultRow=false) {
  const box=document.createElement('span');box.className='mask-card-copy';
  const name=document.createElement('strong');name.textContent=defaultRow?'系统默认':mask.name;
  const preview=document.createElement('small');preview.textContent=defaultRow?'不使用面具':mask.persona || '尚未填写人物设定';
  box.append(name,preview);return box;
 }
 function formError(text=''){const node=byId('maskFormError');node.textContent=text;node.hidden=!text;}
 function captureFocus(){returnFocus=document.activeElement;}
 function restoreFocus(){if(returnFocus?.isConnected)returnFocus.focus();}
 window.renderMaskList=()=>{
  const list=byId('maskListContainer');list.replaceChildren();
  byId('maskEditToggle').textContent=editingList?'完成':'编辑';byId('maskEditToggle').setAttribute('aria-pressed',String(editingList));
  if(!userMasks.length){const empty=document.createElement('div');empty.className='mask-empty';empty.textContent='暂无面具，点击右上角创建。';list.append(empty);return;}
  const group=document.createElement('div');group.className='mask-library-card';
  userMasks.forEach(mask=>{
   const row=document.createElement('div');row.className='mask-library-row';
   const open=document.createElement('button');open.type='button';open.className='mask-card-open';open.setAttribute('aria-label','编辑面具 '+mask.name);open.onclick=()=>editMask(mask.id);open.append(avatar(mask),copy(mask));
   const arrow=document.createElement('span');arrow.innerHTML=chevron;open.append(arrow);row.append(open);
   if(editingList){const remove=document.createElement('button');remove.type='button';remove.className='mask-list-delete';remove.setAttribute('aria-label','删除面具 '+mask.name);remove.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M9 6V3h6v3M7 6l1 15h8l1-15M10 10v7m4-7v7"/></svg>';remove.onclick=event=>deleteMask(mask.id,event);row.append(remove);}
   group.append(row);
  });list.append(group);
 };
 window.toggleMaskListEdit=()=>{editingList=!editingList;renderMaskList();};
 window.openUserMaskPage=()=>{editingList=false;byId('userMaskPage').classList.add('active');renderMaskList();};
 function openEditor(mask){
  captureFocus();editingMaskId=mask?.id ?? null;
  byId('maskEditorTitle').textContent=mask?'编辑面具':'新建面具';byId('addMaskModal').querySelector('.btn-confirm-modal').textContent=mask?'保存':'完成';
  byId('newMaskName').value=mask?.name || '';byId('newMaskPersona').value=mask?.persona || '';
  byId('newMaskAvatar').src=mask?.avatar || defaultAvatar;byId('newMaskAvatar').onerror=()=>{byId('newMaskAvatar').src=defaultAvatar;};
  byId('maskEditorDelete').hidden=!mask;formError();byId('addMaskModal').style.display='flex';byId('addMaskModal').classList.add('show');
  byId('addMaskModal').querySelector('.mask-editor-scroll').scrollTop=0;
 }
 window.openAddMaskModal=()=>openEditor(null);
 window.editMask=id=>{const mask=userMasks.find(item=>String(item.id)===String(id));if(mask)openEditor(mask);};
 window.closeAddMaskModal=()=>{byId('addMaskModal').style.display='none';byId('addMaskModal').classList.remove('show');hideMaskAvatarMenu();closeMaskLinkDialog();editingMaskId=null;restoreFocus();};
 let saving=false;
 window.confirmSaveMask=async()=>{
  if(saving)return;const name=byId('newMaskName').value.trim();if(!name){formError('请填写面具姓名');byId('newMaskName').focus();return;}
  const button=byId('addMaskModal').querySelector('.btn-confirm-modal');saving=true;button.disabled=true;formError();
  try{
   const id=editingMaskId ?? Date.now();const previous=userMasks.find(item=>item.id===id);
   const mask={...previous,id,name,persona:byId('newMaskPersona').value.trim(),avatar:byId('newMaskAvatar').src};
   await db.userMasks.put(mask);const index=userMasks.findIndex(item=>item.id===id);if(index<0)userMasks.push(mask);else userMasks[index]=mask;
   renderMaskList();closeAddMaskModal();
  }catch{formError('保存失败，请重试');}finally{saving=false;button.disabled=false;}
 };
 window.openMaskSelectorForChar=()=>{captureFocus();selectedId=tempSelectedMaskId;renderSelection();byId('maskSelectorModal').style.display='flex';};
 function renderSelection(){
  const list=byId('maskSelectorList');list.replaceChildren();
  [null,...userMasks].forEach(mask=>{
   const button=document.createElement('button');button.type='button';button.className='mask-select-option';button.setAttribute('role','radio');const selected=String(selectedId ?? '')===String(mask?.id ?? '');button.setAttribute('aria-checked',String(selected));
   button.append(avatar(mask),copy(mask,!mask));const check=document.createElement('span');check.className='mask-select-check';check.textContent=selected?'✓':'';check.setAttribute('aria-hidden','true');button.append(check);
   button.onclick=()=>{selectedId=mask?.id ?? null;renderSelection();};list.append(button);
  });
 }
 window.closeMaskSelector=()=>{byId('maskSelectorModal').style.display='none';restoreFocus();};
 window.confirmMaskSelection=()=>selectMaskForChar(userMasks.find(mask=>mask.id===selectedId) || null);
 window.showMaskAvatarMenu=event=>{event?.stopPropagation();byId('maskAvatarMenu').style.display='flex';};
 window.hideMaskAvatarMenu=()=>{byId('maskAvatarMenu').style.display='none';};
 window.changeMaskAvatarByLink=event=>{event?.stopPropagation();hideMaskAvatarMenu();byId('maskAvatarUrl').value='';byId('maskLinkError').hidden=true;byId('maskLinkDialog').hidden=false;byId('maskAvatarUrl').focus();};
 window.closeMaskLinkDialog=()=>{++linkRequest;byId('maskLinkDialog').hidden=true;byId('maskLinkConfirm').disabled=false;};
 window.confirmMaskAvatarLink=async()=>{
  const node=byId('maskAvatarUrl');let url;try{url=new URL(node.value.trim());if(!['http:','https:'].includes(url.protocol))throw new Error();}catch{byId('maskLinkError').textContent='请填写有效的图片链接';byId('maskLinkError').hidden=false;return;}
  const ticket=++linkRequest;byId('maskLinkConfirm').disabled=true;
  try{await new Promise((resolve,reject)=>{const image=new Image();const timer=setTimeout(()=>{image.onload=image.onerror=null;reject(new Error());},20000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(new Error());};image.src=url.href;});if(ticket!==linkRequest)return;byId('newMaskAvatar').src=url.href;closeMaskLinkDialog();}
  catch{if(ticket===linkRequest){byId('maskLinkError').textContent='图片无法加载，请检查链接';byId('maskLinkError').hidden=false;}}
  finally{if(ticket===linkRequest)byId('maskLinkConfirm').disabled=false;}
 };
 window.deleteMask=(id,event)=>{event?.stopPropagation();const mask=userMasks.find(item=>String(item.id)===String(id));if(!mask)return;deleteId=mask.id;byId('maskDeleteDescription').textContent=`删除“${mask.name}”后将无法恢复。`;byId('maskDeleteError').hidden=true;byId('maskDeleteDialog').hidden=false;};
 window.closeMaskDeleteDialog=()=>{if(byId('maskConfirmDelete').disabled)return;byId('maskDeleteDialog').hidden=true;deleteId=null;};
 window.confirmMaskDelete=async()=>{
  if(deleteId==null)return;const id=deleteId;const button=byId('maskConfirmDelete');if(button.disabled)return;button.disabled=true;
  try{await db.userMasks.delete(id);userMasks=userMasks.filter(mask=>mask.id!==id);if(tempSelectedMaskId===id)selectMaskForChar(null);if(editingMaskId===id)closeAddMaskModal();renderMaskList();button.disabled=false;closeMaskDeleteDialog();}
  catch{byId('maskDeleteError').textContent='删除失败，请重试';byId('maskDeleteError').hidden=false;}
  finally{button.disabled=false;}
 };
 for(const overlay of [byId('maskLinkDialog'),byId('maskDeleteDialog')])overlay.addEventListener('click',event=>event.stopPropagation());
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
   if(!byId('maskDeleteDialog').hidden){closeMaskDeleteDialog();event.stopImmediatePropagation();}
   else if(!byId('maskLinkDialog').hidden){closeMaskLinkDialog();event.stopImmediatePropagation();}
   else if(byId('maskAvatarMenu').style.display==='flex'){hideMaskAvatarMenu();event.stopImmediatePropagation();}
   else if(byId('maskSelectorModal').style.display==='flex'){closeMaskSelector();event.stopImmediatePropagation();}
   else if(byId('addMaskModal').style.display==='flex'){closeAddMaskModal();event.stopImmediatePropagation();}
  }
  if(event.key==='Tab'){
   const modal=[byId('maskDeleteDialog'),byId('maskLinkDialog'),byId('maskAvatarMenu'),byId('maskSelectorModal'),byId('addMaskModal')].find(node=>!node.hidden&&getComputedStyle(node).display!=='none');
   if(!modal)return;const controls=[...modal.querySelectorAll('button,input,textarea')].filter(node=>!node.disabled&&!node.hidden&&node.getClientRects().length);const first=controls[0],last=controls.at(-1);
   if(event.shiftKey&&document.activeElement===first){last?.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first?.focus();event.preventDefault();}
  }
 },true);
})();
