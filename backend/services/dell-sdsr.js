/**
 * Dell SDSR (self-dispatch) SOAP client — sandbox by default via DELL.env.
 * CreateDispatch is only called when CheckLogin succeeds.
 */
const { loadDellEnv } = require('../utils/dell-env');

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function envelope(inner) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="http://api.dell.com">
  <soapenv:Header/>
  <soapenv:Body>
    ${inner}
  </soapenv:Body>
</soapenv:Envelope>`;
}

function parseFault(text) {
  const fault = text.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
  return fault ? fault[1].trim() : null;
}

function textOf(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function allBlocks(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

async function getDispatchToken() {
  const env = loadDellEnv();
  const tokenUrl = env.DELL_DISPATCH_TOKEN_URL;
  const clientId = env.DELL_DISPATCH_CLIENT_ID;
  const clientSecret = env.DELL_DISPATCH_CLIENT_SECRET;
  if (!tokenUrl || !clientId || !clientSecret) {
    throw new Error('DELL.env missing dispatch OAuth credentials');
  }
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`Dispatch token failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

async function soapCall(action, inner) {
  const env = loadDellEnv();
  const url = env.DELL_DISPATCH_API_URL;
  if (!url) throw new Error('DELL.env missing DELL_DISPATCH_API_URL');

  const token = await getDispatchToken();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      SOAPAction: `"${action}"`,
      'Content-Type': 'text/xml; charset=utf-8',
      Accept: 'text/xml',
    },
    body: envelope(inner),
  });
  const text = await res.text();
  const fault = parseFault(text);
  return {
    ok: res.ok && !fault,
    status: res.status,
    fault,
    body: text,
  };
}

function techCreds() {
  const env = loadDellEnv();
  const user = env.DELL_DISPATCH_TECH_EMAIL || env.DELL_DISPATCH_USER_ID;
  const pass = env.DELL_DISPATCH_TECH_PASSWORD || '';
  if (!user) throw new Error('DELL.env missing DELL_DISPATCH_TECH_EMAIL');
  return { user, pass, env };
}

/**
 * CheckLogin — returns technician info / groups / certs, or { ok:false, error }.
 */
async function checkLogin() {
  const { user, pass } = techCreds();
  const result = await soapCall(
    'http://api.dell.com/IDispatchService/CheckLogin',
    `<api:CheckLogin><api:Username>${xmlEscape(user)}</api:Username><api:Password>${xmlEscape(pass)}</api:Password></api:CheckLogin>`
  );
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      error: result.fault || `HTTP ${result.status}`,
      ready: false,
    };
  }
  const body = result.body;
  const relationships = allBlocks(body, 'RelationshipInfo').map((block) => ({
    branchName: textOf(block, 'BranchName'),
    customerName: textOf(block, 'CustomerName'),
    track: textOf(block, 'Track'),
  }));
  const certificates = allBlocks(body, 'CertificateInfo').map((block) => ({
    certificate: textOf(block, 'certificate') || textOf(block, 'Certificate'),
    expirationDate: textOf(block, 'ExpirationDate'),
  }));
  return {
    ok: true,
    ready: true,
    fullName: textOf(body, 'FullName'),
    role: textOf(body, 'Role'),
    relationships,
    certificates,
  };
}

async function getPartsByServiceTag(serviceTag) {
  const { user, pass } = techCreds();
  const result = await soapCall(
    'http://api.dell.com/IDispatchService/GetPartsbyServiceTag',
    `<api:GetPartsbyServiceTag><api:Username>${xmlEscape(user)}</api:Username><api:Password>${xmlEscape(pass)}</api:Password><api:ServiceTag>${xmlEscape(serviceTag)}</api:ServiceTag></api:GetPartsbyServiceTag>`
  );
  if (!result.ok) {
    return { ok: false, error: result.fault || `HTTP ${result.status}`, parts: [] };
  }
  const body = result.body;
  const parts = allBlocks(body, 'PartInformation').map((block) => ({
    partTypeCode: textOf(block, 'PartTypeCode'),
    partNumber: textOf(block, 'PartNumber'),
    partDescription: textOf(block, 'PartDescription'),
  }));
  return {
    ok: true,
    model: textOf(body, 'Model'),
    modelDescription: textOf(body, 'ModelDescription'),
    parts,
  };
}

/**
 * CreateDispatch — returns work order / DPS on success.
 */
async function createDispatch(payload) {
  const { user, pass, env } = techCreds();
  const branch = payload.branchName || env.DELL_DISPATCH_GROUP_NAME || '';
  const customer = payload.dellCustomerName || env.DELL_DISPATCH_CUSTOMER_NAME || '';
  const track = payload.track || 'Tier 1';
  const techEmail = payload.techEmail || user;
  const note = String(payload.troubleshootingNote || '').slice(0, 1000);

  let partsXml = '';
  const parts = Array.isArray(payload.parts) ? payload.parts.slice(0, 4) : [];
  if (parts.length) {
    partsXml = '<api:Parts>' + parts.map((p) => `
      <api:Part>
        <api:PartNumber>${xmlEscape(p.partNumber)}</api:PartNumber>
        <api:PPID>${xmlEscape(p.ppid || '')}</api:PPID>
        <api:Quantity>${Number(p.quantity) || 1}</api:Quantity>
      </api:Part>`).join('') + '</api:Parts>';
  } else {
    partsXml = '<api:Parts/>';
  }

  let attachmentsXml = '<api:Attachments/>';
  if (Array.isArray(payload.attachments) && payload.attachments.length) {
    attachmentsXml =
      '<api:Attachments>' +
      payload.attachments
        .map(
          (a) => `
      <api:Attachment>
        <api:Description>${xmlEscape(a.description || a.filename)}</api:Description>
        <api:FileName>${xmlEscape(a.filename)}</api:FileName>
        <api:MIMEType>${xmlEscape(a.mimeType || 'application/octet-stream')}</api:MIMEType>
        <api:FileData>${a.base64 || ''}</api:FileData>
      </api:Attachment>`
        )
        .join('') +
      '</api:Attachments>';
  }

  const alt =
    payload.alternateContactName
      ? `<api:AlternateContactName>${xmlEscape(payload.alternateContactName)}</api:AlternateContactName>
         <api:AlternateContactPhone>${xmlEscape(payload.alternateContactPhone || '')}</api:AlternateContactPhone>`
      : '<api:AlternateContactName/><api:AlternateContactPhone/>';

  const inner = `
    <api:CreateDispatch>
      <api:Username>${xmlEscape(user)}</api:Username>
      <api:Password>${xmlEscape(pass)}</api:Password>
      <api:TechEmail>${xmlEscape(techEmail)}</api:TechEmail>
      <api:Branch>${xmlEscape(branch)}</api:Branch>
      <api:Customer>${xmlEscape(customer)}</api:Customer>
      <api:Track>${xmlEscape(track)}</api:Track>
      <api:ServiceTag>${xmlEscape(payload.serviceTag)}</api:ServiceTag>
      <api:PrimaryContactName>${xmlEscape(payload.primaryContactName)}</api:PrimaryContactName>
      <api:PrimaryContactPhone>${xmlEscape(payload.primaryContactPhone)}</api:PrimaryContactPhone>
      <api:PrimaryContactEmail>${xmlEscape(payload.primaryContactEmail)}</api:PrimaryContactEmail>
      ${alt}
      <api:CountryISOCode>${xmlEscape(payload.countryIsoCode || 'US')}</api:CountryISOCode>
      <api:City>${xmlEscape(payload.city)}</api:City>
      <api:State>${xmlEscape(payload.state)}</api:State>
      <api:ZipCode>${xmlEscape(payload.zip)}</api:ZipCode>
      <api:AddressLine1>${xmlEscape(payload.addressLine1)}</api:AddressLine1>
      <api:AddressLine2>${xmlEscape(payload.addressLine2 || '')}</api:AddressLine2>
      <api:AddressLine3>${xmlEscape(payload.addressLine3 || '')}</api:AddressLine3>
      <api:TimeZone>${xmlEscape(payload.timezone || 'US/Eastern')}</api:TimeZone>
      <api:ReferencePONumber>${xmlEscape(payload.referencePo || '')}</api:ReferencePONumber>
      <api:RequestCompleteCare>${payload.requestCompleteCare ? 'true' : 'false'}</api:RequestCompleteCare>
      <api:RequestReturnToDepot>${payload.requestReturnToDepot ? 'true' : 'false'}</api:RequestReturnToDepot>
      <api:RequestOnSiteTechnician>${payload.requestOnsiteTechnician ? 'true' : 'false'}</api:RequestOnSiteTechnician>
      <api:TroubleshootingNote>${xmlEscape(note)}</api:TroubleshootingNote>
      ${partsXml}
      ${attachmentsXml}
    </api:CreateDispatch>`;

  const result = await soapCall('http://api.dell.com/IDispatchService/CreateDispatch', inner);
  if (!result.ok) {
    return { ok: false, error: result.fault || `HTTP ${result.status}`, raw: result.body.slice(0, 2000) };
  }
  return {
    ok: true,
    workOrder: textOf(result.body, 'WorkOrder') || textOf(result.body, 'DispatchCode'),
    dpsNumber: textOf(result.body, 'DPSNumber'),
    dispatchCode: textOf(result.body, 'DispatchCode'),
    result: textOf(result.body, 'Result'),
    raw: result.body.slice(0, 2000),
  };
}

async function getDispatchStatus(code) {
  const { user, pass } = techCreds();
  const result = await soapCall(
    'http://api.dell.com/IDispatchService/GetDispatchStatus',
    `<api:GetDispatchStatus><api:Username>${xmlEscape(user)}</api:Username><api:Password>${xmlEscape(pass)}</api:Password><api:Code>${xmlEscape(code)}</api:Code></api:GetDispatchStatus>`
  );
  if (!result.ok) {
    return { ok: false, error: result.fault || `HTTP ${result.status}` };
  }
  return {
    ok: true,
    result: textOf(result.body, 'Result'),
    status: textOf(result.body, 'Status'),
    dpsNumber: textOf(result.body, 'DPSNumber'),
    dispatchCode: textOf(result.body, 'DispatchCode'),
    orderDeniedReason: textOf(result.body, 'OrderDeniedReason'),
  };
}

async function resubmitDispatch(code) {
  const { user, pass } = techCreds();
  const result = await soapCall(
    'http://api.dell.com/IDispatchService/ResubmitDispatch',
    `<api:ResubmitDispatch><api:Username>${xmlEscape(user)}</api:Username><api:Password>${xmlEscape(pass)}</api:Password><api:Code>${xmlEscape(code)}</api:Code></api:ResubmitDispatch>`
  );
  if (!result.ok) {
    return { ok: false, error: result.fault || `HTTP ${result.status}` };
  }
  return {
    ok: true,
    result: textOf(result.body, 'Result'),
    status: textOf(result.body, 'Status'),
    dpsNumber: textOf(result.body, 'DPSNumber'),
    dispatchCode: textOf(result.body, 'DispatchCode'),
  };
}

/** Map Dell status strings into our local status enum. */
function mapDellStatus(rawStatus) {
  const s = String(rawStatus || '').toLowerCase();
  if (!s) return null;
  if (s.includes('denied') || s.includes('deny')) return 'denied';
  if (s.includes('ship')) return 'shipped';
  if (s.includes('issued') || s.includes('dsp') || s.includes('ord') || s.includes('que')) return 'issued';
  if (s.includes('submit') || s.includes('review') || s.includes('hold') || s.includes('pending')) return 'submitted';
  if (s.includes('claim') || s.includes('defective')) return 'received';
  return 'submitted';
}

module.exports = {
  checkLogin,
  getPartsByServiceTag,
  createDispatch,
  getDispatchStatus,
  resubmitDispatch,
  mapDellStatus,
  getDispatchToken,
};
