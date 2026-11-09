// FieldForce 360 - demo seed data (prototype only; no real customer data).
// Demo logins (field officers): EMP001..EMP005, PIN 1234
window.SEED = {
  org: { name: 'Demo Finance Ltd (NBFC)', geofenceMeters: 150 },
  branches: [
    { id: 'TNG', name: 'T. Nagar Branch', lat: 13.0418, lng: 80.2341 },
    { id: 'ADY', name: 'Adyar Branch', lat: 13.0063, lng: 80.2574 },
    { id: 'ANN', name: 'Anna Nagar Branch', lat: 13.0850, lng: 80.2101 }
  ],
  employees: [
    { id: 'EMP001', name: 'Arun Kumar', role: 'Field Officer', branch: 'TNG', pin: '1234', color: '#2563eb', phone: '+91 98400 10001' },
    { id: 'EMP002', name: 'Priya Sundaram', role: 'Collection Executive', branch: 'ADY', pin: '1234', color: '#db2777', phone: '+91 98400 10002' },
    { id: 'EMP003', name: 'Karthik Raman', role: 'Field Officer', branch: 'ANN', pin: '1234', color: '#16a34a', phone: '+91 98400 10003' },
    { id: 'EMP004', name: 'Divya Mohan', role: 'Verification Officer', branch: 'TNG', pin: '1234', color: '#ea580c', phone: '+91 98400 10004' },
    { id: 'EMP005', name: 'Suresh Babu', role: 'Collection Executive', branch: 'ADY', pin: '1234', color: '#7c3aed', phone: '+91 98400 10005' }
  ],
  // type: COLLECTION | ADDRESS | DOCUMENT | NEWLOAN
  visits: [
    { id: 'V101', emp: 'EMP001', customer: 'Lakshmi Narayanan', loan: 'LN-TNG-20431', type: 'COLLECTION', address: '12, Usman Road, T. Nagar', lat: 13.0386, lng: 80.2335, due: 12500, overdueDays: 5 },
    { id: 'V102', emp: 'EMP001', customer: 'Mohammed Rafi', loan: 'APP-TNG-7781', type: 'ADDRESS', address: '4/2, Pondy Bazaar, T. Nagar', lat: 13.0428, lng: 80.2400, due: 0, overdueDays: 0 },
    { id: 'V103', emp: 'EMP001', customer: 'Kavitha Rajan', loan: 'LN-TNG-19870', type: 'COLLECTION', address: '27, Lake View Rd, West Mambalam', lat: 13.0352, lng: 80.2226, due: 8750, overdueDays: 12 },
    { id: 'V104', emp: 'EMP001', customer: 'S. Venkatesh', loan: 'APP-TNG-7790', type: 'NEWLOAN', address: '9, Arcot Road, Kodambakkam', lat: 13.0497, lng: 80.2245, due: 0, overdueDays: 0 },
    { id: 'V105', emp: 'EMP001', customer: 'Meena Gopal', loan: 'LN-TNG-18112', type: 'COLLECTION', address: '33, Jones Road, Saidapet', lat: 13.0222, lng: 80.2238, due: 15000, overdueDays: 30 },

    { id: 'V201', emp: 'EMP002', customer: 'Anitha Joseph', loan: 'LN-ADY-30211', type: 'COLLECTION', address: '6th Ave, Besant Nagar', lat: 13.0003, lng: 80.2667, due: 9000, overdueDays: 3 },
    { id: 'V202', emp: 'EMP002', customer: 'Ramesh Iyer', loan: 'LN-ADY-30180', type: 'COLLECTION', address: 'ECR Link Rd, Thiruvanmiyur', lat: 12.9830, lng: 80.2594, due: 11200, overdueDays: 18 },
    { id: 'V203', emp: 'EMP002', customer: 'Farida Begum', loan: 'APP-ADY-5530', type: 'DOCUMENT', address: 'Kotturpuram Main Rd', lat: 13.0186, lng: 80.2420, due: 0, overdueDays: 0 },
    { id: 'V204', emp: 'EMP002', customer: 'Joseph Antony', loan: 'LN-ADY-29954', type: 'COLLECTION', address: '2nd Ave, Indira Nagar', lat: 12.9940, lng: 80.2510, due: 6500, overdueDays: 7 },

    { id: 'V301', emp: 'EMP003', customer: 'Bharath Kumar', loan: 'LN-ANN-41022', type: 'COLLECTION', address: 'AC Block, Anna Nagar West', lat: 13.0878, lng: 80.2010, due: 14000, overdueDays: 9 },
    { id: 'V302', emp: 'EMP003', customer: 'Sangeetha P', loan: 'APP-ANN-6610', type: 'ADDRESS', address: 'Shenoy Nagar Main Rd', lat: 13.0790, lng: 80.2250, due: 0, overdueDays: 0 },
    { id: 'V303', emp: 'EMP003', customer: 'Ganesh Prabhu', loan: 'LN-ANN-40877', type: 'COLLECTION', address: 'Aminjikarai Market St', lat: 13.0710, lng: 80.2200, due: 7800, overdueDays: 21 },
    { id: 'V304', emp: 'EMP003', customer: 'Revathi Shankar', loan: 'LN-ANN-40501', type: 'COLLECTION', address: 'Phase 2, Mogappair', lat: 13.0837, lng: 80.1767, due: 10500, overdueDays: 4 },

    { id: 'V401', emp: 'EMP004', customer: 'Harish Chandran', loan: 'LN-TNG-20555', type: 'COLLECTION', address: '11th Ave, Ashok Nagar', lat: 13.0370, lng: 80.2120, due: 9900, overdueDays: 6 },
    { id: 'V402', emp: 'EMP004', customer: 'Nirmala Devi', loan: 'APP-TNG-7802', type: 'DOCUMENT', address: 'Sector 9, KK Nagar', lat: 13.0390, lng: 80.1990, due: 0, overdueDays: 0 },
    { id: 'V403', emp: 'EMP004', customer: 'Prakash Rao', loan: 'LN-TNG-20190', type: 'COLLECTION', address: '100 Ft Rd, Vadapalani', lat: 13.0500, lng: 80.2120, due: 12000, overdueDays: 14 },

    { id: 'V501', emp: 'EMP005', customer: 'Usha Rani', loan: 'LN-ADY-29700', type: 'COLLECTION', address: 'Luz Church Rd, Mylapore', lat: 13.0339, lng: 80.2697, due: 8000, overdueDays: 11 },
    { id: 'V502', emp: 'EMP005', customer: 'Dinesh Kumar', loan: 'LN-ADY-29811', type: 'COLLECTION', address: 'RA Puram 3rd Main Rd', lat: 13.0270, lng: 80.2550, due: 5500, overdueDays: 2 }
  ]
};
