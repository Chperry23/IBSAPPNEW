/**
 * Normalize Dell dispatch create/submit API responses into user-facing toast copy.
 */
export function parseDellSubmitResponse(http, res = {}) {
  const wo =
    res.work_order ||
    res.dps_number ||
    res.dispatch?.work_order ||
    res.dispatch?.dps_number ||
    null;

  const dellError =
    res.error ||
    res.dispatch?.dell_last_error ||
    (typeof res.message === 'string' && res.message.includes('failed') ? res.message : null);

  const explicitlyFailed = !http.ok || res.ok === false || res.success === false;
  const linked = res.linked === true;
  const removed = res.deleted_duplicates?.length || 0;
  const accepted = !explicitlyFailed && Boolean(wo) && res.ok !== false;

  if (linked && accepted) {
    return {
      type: 'success',
      title: 'Linked to Dell',
      message:
        res.message ||
        `Linked to Dell work order ${wo}.${removed ? ` Removed ${removed} duplicate local request(s).` : ''}`,
    };
  }

  if (accepted) {
    const status = res.dispatch?.status;
    const title =
      status === 'issued' || status === 'shipped' || status === 'received'
        ? 'Dell dispatch active'
        : 'Submitted to Dell';
    return {
      type: 'success',
      title,
      message:
        res.message ||
        `Dell work order ${wo} — status “${status || 'submitted'}”.${removed ? ` Removed ${removed} duplicate local request(s).` : ''} Use “Update from Dell” to refresh status.`,
    };
  }

  if (http.status === 429) {
    return {
      type: 'info',
      title: 'Please wait',
      message:
        res.message ||
        'A submit to Dell is already running for this dispatch. Wait for it to finish before trying again.',
    };
  }

  if (http.status === 409) {
    return {
      type: 'info',
      title: 'Already on Dell',
      message:
        res.message ||
        `This dispatch already has work order ${wo || 'on file'}. Use “Update from Dell” for the latest status.`,
    };
  }

  if (res.dispatch && !explicitlyFailed && !wo) {
    const localErr = res.dispatch.dell_last_error || dellError;
    return {
      type: 'error',
      title: 'Saved locally — Dell did not accept yet',
      message:
        res.message ||
        (localErr
          ? `${localErr} Your request is saved on this tablet — tap “Submit to Dell” to try again.`
          : 'Dell did not return a work order. Your request is saved locally — try “Submit to Dell” again.'),
    };
  }

  const failText =
    res.message ||
    dellError ||
    (http.ok ? 'Dell did not return a work order' : `Server error (${http.status})`);

  return {
    type: 'error',
    title: 'Could not submit to Dell',
    message: failText.includes('saved locally')
      ? failText
      : `${failText} Your request is still saved on this tablet — you can try again.`,
  };
}

export function parseDellRefreshResponse(http, res = {}) {
  if (!http.ok || res.error) {
    return {
      type: 'error',
      title: 'Update from Dell failed',
      message: res.message || res.error || 'Could not refresh status from Dell. Try again in a moment.',
    };
  }
  const dellStatus = res.dell?.status || res.dell?.result || res.dispatch?.status || 'updated';
  return {
    type: 'success',
    title: 'Updated from Dell',
    message: res.message || `Status is now “${dellStatus}”.`,
  };
}
