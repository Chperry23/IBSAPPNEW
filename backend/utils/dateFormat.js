const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (e) {
    return dateStr;
  }
};

const formatStatus = (status) => {
  if (!status) return 'N/A';
  return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
};

const formatValue = (val) => {
  if (val === undefined || val === null || val === '') return 'N/A';
  return val;
};

module.exports = { formatDate, formatStatus, formatValue };
