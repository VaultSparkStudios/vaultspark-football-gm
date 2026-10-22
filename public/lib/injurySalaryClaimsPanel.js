import { state, api } from './appState.js';
import { runAction } from './appCore.js';
import { loadState, loadRoster } from './gameFlow.js';
const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export function renderInjurySalaryClaims(claims) {
  const card=document.getElementById('injurySalaryClaimsCard'),list=document.getElementById('injurySalaryClaimsList');
  card.hidden=!claims.length;list.replaceChildren();
  for(const claim of claims){
    const row=document.createElement('article'),title=document.createElement('h4'),summary=document.createElement('p'),guidance=document.createElement('p');
    title.textContent=`${claim.playerName} · ${claim.status==='settled'?'Settled':'Pending claim'}`;
    summary.textContent=`Injury year ${claim.injuryYear} · Disputed ${money(claim.claimedCents)} · Original reserve ${money(claim.reservedCents)} · ${claim.status==='settled'?'Settlement':'Representative requests'} ${money(claim.requestedCents)}`;
    guidance.className='small';guidance.textContent=claim.unavailableReason||claim.agreementScope;
    row.append(title,summary,guidance);
    if(claim.canOffer&&claim.teamId===state.dashboard?.controlledTeamId){
      const form=document.createElement('form'),label=document.createElement('label'),input=document.createElement('input'),button=document.createElement('button'),status=document.createElement('p');
      form.className='row';label.textContent='Salary offer ($) ';input.type='text';input.inputMode='decimal';input.value=`${Math.floor(claim.requestedCents/100)}.${String(claim.requestedCents%100).padStart(2,'0')}`;input.required=true;
      input.setAttribute('aria-label',`Salary offer for ${claim.playerName}`);input.style.width='min(100%,12rem)';label.append(input);button.type='submit';button.textContent='Offer salary settlement';status.setAttribute('role','status');
      form.append(label,button);form.addEventListener('submit',event=>{
        event.preventDefault();const text=input.value.trim();
        if(!/^\d+(?:\.\d{1,2})?$/.test(text)){status.textContent='Enter a dollar amount with up to two decimal places.';return;}
        const [dollars,fraction='']=text.split('.'),amount=BigInt(dollars)*100n+BigInt(fraction.padEnd(2,'0'));
        if(amount>BigInt(Number.MAX_SAFE_INTEGER)){status.textContent='The offer is too large.';return;}
        runAction(async()=>{
          const result=await api('/api/injury-salary-claims/offer',{method:'POST',body:{teamId:claim.teamId,claimId:claim.claimId,paidCents:Number(amount),expectedPaymentYear:claim.paymentYear}});
          if(!result.accepted&&!result.alreadySettled){status.textContent=`Offer declined. Representative requests ${money(result.requestedCents)}. Claim, player and cap records are unchanged.`;return;}
          await Promise.all([loadState(),loadRoster()]);
        },'Reviewing salary offer...',{key:'injury-salary-claim',controls:[button]});
      });
      const basis=document.createElement('p');basis.className='small';basis.textContent=claim.bargainingBasis;
      row.append(form,status,basis);
    }
    list.append(row);
  }
}
