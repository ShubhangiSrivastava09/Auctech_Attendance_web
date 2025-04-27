import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  Alert,
  Modal,
  TextInput,
  Button,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import {NetworkInfo} from 'react-native-network-info';
import {useDispatch, useSelector} from 'react-redux';
import axios from 'axios';
import {PermissionsAndroid, Platform} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import {BASE_URL} from '@env';

import styles from './dashboardStyles';
import ActionButton from '../../components/actionButton/actionButton';
import Header from '../../components/header/header';
import BreakModal from '../../components/breakModal/breakModal';
import {
  setLoginTime as setLoginTimeRedux,
  clearLoginTime,
  clearBreakState,
  setBreakState,
} from '../../redux/slices/authSlice';
import {setAddress, setLocation} from '../../redux/slices/locationSlice';
import {
  getAddressFromCoords,
  parseTimeAMPMToDate,
  formatTimeFromSeconds,
} from '../../utils/commonMethods';
import ActiveLogs from '../../components/activeLogs/activeLogs';

const API_URL = `${BASE_URL}/saveattendance`;
const BEARER_TOKEN =
  'zhlbnjuNwxXJzzNnetrb+9J6LZiBYGUHTSZiJzQMVsumrPJGco6G7p/y6g==:ZlpToWj3OauX6HhgvFp3XL1IX2O+hxlasave';

const Dashboard = ({navigation}) => {
  const dispatch = useDispatch();
  const userDetails = useSelector(state => state.auth.userDetails);
  console.log(typeof userDetails);

  const {
    StaffName,
    EmpCode,
    UserId,
    DesignationName,
    Logingtime,
    ProfilePhoto,
  } = useSelector(state => state.auth.userDetails);
  const {loginTime, isOnBreak, breakStartTime, breakType} = useSelector(
    state => state.auth,
  );

  const [reason, setReason] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBreakSubmitting, setIsBreakSubmitting] = useState(false);
  const [isBreakOutSubmitting, setIsBreakOutSubmitting] = useState(false);

  const [reasonModalVisible, setReasonModalVisible] = useState(false);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [remainingTime, setRemainingTime] = useState(null);

  console.log('Event Type', loginTime, isOnBreak, breakStartTime, breakType);

  const getDeviceInfo = async () => {
    let deviceId = 'unknown-device';
    let localIP = '0.0.0.0';
    let resolvedAddress = 'Not Available';
    let coords = 'Not Available';

    if (Platform.OS === 'web') {
      // Web polyfill logic
      deviceId = 'web-' + Math.random().toString(36).substring(2, 10);
      localIP = 'web-ip'; // Optional: you can get public IP via external APIs if needed

      if ('geolocation' in navigator) {
        //@ts-ignore
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
            });
          });

          const {latitude, longitude} = position.coords;
          coords = `${latitude},${longitude}`;

          dispatch(setLocation({latitude, longitude}));

          try {
            resolvedAddress = await getAddressFromCoords(latitude, longitude);
            dispatch(setAddress(resolvedAddress));
          } catch (e) {
            console.warn('Web Reverse geocoding failed:', e);
          }
        } catch (geoError) {
          console.warn('Web Geolocation error:', geoError);
        }
      } else {
        console.warn('Geolocation not supported in browser');
      }
    } else {
      // Mobile Native logic
      deviceId = await DeviceInfo.getUniqueId();
      localIP = await NetworkInfo.getIPAddress();

      const permissionGranted = await requestLocationPermission();

      if (permissionGranted) {
        try {
          const position = await new Promise((resolve, reject) => {
            Geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 15000,
              maximumAge: 0,
            });
          });

          const {latitude, longitude} = position.coords;
          coords = `${latitude},${longitude}`;

          dispatch(setLocation({latitude, longitude}));

          try {
            resolvedAddress = await getAddressFromCoords(latitude, longitude);
            dispatch(setAddress(resolvedAddress));
          } catch (e) {
            console.warn('Native Reverse geocoding failed:', e);
          }
        } catch (geoError) {
          console.warn('Native Geolocation error:', geoError);
        }
      } else {
        console.warn('Location permission not granted');
      }
    }

    return {
      deviceId,
      ipAddress: localIP,
      location: coords,
      resolvedAddress,
    };
  };

  const requestLocationPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Access Required',
            message:
              'This app needs to access your location for attendance logging.',
            buttonPositive: 'OK',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn('Permission request error:', err);
        return false;
      }
    } else if (Platform.OS === 'ios') {
      // Assume permissions are handled via Info.plist
      return true;
    } else {
      // Web
      return true;
    }
  };
  const isAfter945 = () => {
    if (!Logingtime) return false;

    const [time, meridian] = Logingtime.split(' ');
    const [hoursStr, minutesStr] = time.split(':');
    let hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);

    // Convert to 24-hour format
    if (meridian.toLowerCase() === 'pm' && hours !== 12) {
      hours += 12;
    } else if (meridian.toLowerCase() === 'am' && hours === 12) {
      hours = 0;
    }

    const now = new Date();
    const loginDeadline = new Date();
    loginDeadline.setHours(hours, minutes + 15, 0, 0); // add 15 minutes grace

    return now > loginDeadline;
  };
  // if it's in a separate file

  const isBreakLate = () => {
    console.log('Checking if break is late...');

    if (!breakStartTime || breakType !== 'LunchBreak') return false;

    const start = parseTimeAMPMToDate(breakStartTime);
    if (!start) return false;

    const now = new Date();
    const diffMinutes = (now - start) / 1000 / 60;

    console.log(`Break duration: ${diffMinutes.toFixed(2)} minutes`);

    return diffMinutes > 40;
  };

  const sendLogToAPI = async (dataOverrides = {}) => {
    try {
      const {deviceId, ipAddress, location, resolvedAddress} =
        await getDeviceInfo();

      const payload = {
        UserId: UserId,
        AddedBy: UserId,
        IPAddress: ipAddress,
        DeviceId: deviceId,
        EventStatus: dataOverrides.EventStatus || '',
        BrakeType: dataOverrides.BrakeType || '',
        ReasonofLate: dataOverrides.ReasonofLate || '',
        ReasonofBrake: dataOverrides.ReasonofBrake || '',
        ReasonofchangeIP: '',
        ReasonofChangeLocation: '',
        Location: resolvedAddress || location || 'Not Available',
      };
      console.log(payload);

      const response = await axios.post(API_URL, payload, {
        headers: {
          Authorization: `Bearer ${BEARER_TOKEN}`,
        },
      });

      console.log('Log sent:', response.data);
    } catch (error) {
      console.error('Failed to log:', error?.message || error);
    }
  };

  const submitReason = async () => {
    if (isSubmitting || isBreakSubmitting) return;

    let setLoading;
    if (pendingAction === 'login') {
      setLoading = setIsSubmitting;
      setIsSubmitting(true);
    } else {
      setLoading = setIsBreakSubmitting;
      setIsBreakSubmitting(true);
    }

    try {
      if (!reason.trim()) {
        Alert.alert('Please enter a reason');
        return;
      }

      let data = {};
      const now = new Date();

      switch (pendingAction) {
        case 'login':
          data = {EventStatus: 'Login', ReasonofLate: reason};
          dispatch(
            setLoginTimeRedux(
              now
                .toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })
                .replace(' ', ''),
            ),
          );
          break;

        case 'breakin-other':
          data = {
            EventStatus: 'BreakIn',
            BrakeType: 'Other',
            ReasonofBrake: reason,
          };
          dispatch(
            setBreakState({
              isOnBreak: true,
              breakStartTime: now
                .toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })
                .replace(' ', ''),
              breakType: 'Other',
            }),
          );
          break;

        case 'breakout-late':
          data = {
            EventStatus: 'BreakOut',
            BrakeType: breakType,
            ReasonofBrake: reason,
          };
          break; // Don’t dispatch here; do it only after logging
      }

      // 🔥 Important: Send the API log first
      await sendLogToAPI(data);

      // ✅ Only clear break state AFTER successful API log for breakout-late
      if (pendingAction === 'breakout-late') {
        dispatch(clearBreakState());
        setRemainingTime(0);
      }

      // ✅ Cleanup after submission
      setReason('');
      setReasonModalVisible(false);
      setPendingAction(null);
    } catch (err) {
      console.error('submitReason failed:', err);
    } finally {
      setLoading(false); // Reset only the appropriate submitting state
    }
  };

  const handleLoginLogout = async () => {
    // 🚨 Check if user is on break and trying to log out
    if (!loginTime) {
      const now = new Date();

      if (isAfter945()) {
        setPendingAction('login');
        setReasonModalVisible(true);
      } else {
        dispatch(
          setLoginTimeRedux(
            now
              .toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              })
              .replace(' ', ''),
          ),
        );
        await sendLogToAPI({EventStatus: 'Login'});
      }
    } else {
      // ✅ Employee is logged in
      if (isOnBreak) {
        Alert.alert(
          'Break still active',
          'Please end your break before logging out.',
          [{text: 'OK'}],
        );
        return;
      }

      // ✅ Safe to logout
      dispatch(clearLoginTime());
      await sendLogToAPI({EventStatus: 'Logout'});
    }
  };

  const handleBreakPress = async () => {
    // Prevent multiple clicks
    if (isBreakOutSubmitting) return;

    if (!isOnBreak) {
      setShowBreakModal(true);
    } else {
      if (breakType === 'LunchBreak' && isBreakLate()) {
        setPendingAction('breakout-late');
        setReasonModalVisible(true);
        return;
      }

      // Start loader
      setIsBreakOutSubmitting(true);
      try {
        await sendLogToAPI({EventStatus: 'BreakOut', BrakeType: breakType});
        dispatch(clearBreakState());
      } catch (err) {
        console.error('BreakOut error:', err);
      } finally {
        setIsBreakOutSubmitting(false); // Stop loader
      }
    }
  };

  const handleBreakConfirm = async (type, reasonInput) => {
    if (isBreakSubmitting) return; // Prevent multiple clicks
    console.log(isBreakSubmitting);

    setIsBreakSubmitting(true); // Disable button

    const selectedType = type === 'lunch' ? 'LunchBreak' : 'Other';
    const now = new Date();

    if (selectedType === 'LunchBreak') {
      setRemainingTime(40 * 60); // 40 minutes in seconds
    }

    const data = {
      EventStatus: 'BreakIn',
      BrakeType: selectedType,
      ReasonofBrake: selectedType === 'Other' ? reasonInput : '',
    };

    try {
      await sendLogToAPI({...data});

      dispatch(
        setBreakState({
          isOnBreak: true,
          breakStartTime: now
            .toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            })
            .replace(' ', ''),
          breakType: selectedType,
        }),
      );
      setShowBreakModal(false);
    } catch (error) {
      console.error('Error during break-in:', error);
      // Optional: show an error message to the user
    } finally {
      setIsBreakSubmitting(false); // Re-enable button after all is done
    }
  };

  useEffect(() => {
    console.log('break logs', breakStartTime, breakType);

    if (!breakStartTime || breakType !== 'LunchBreak') return;
    const breakStart = parseTimeAMPMToDate(breakStartTime);
    console.log('Break Start', breakStart);

    const getRemainingSeconds = () => {
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - breakStart) / 1000);
      const remainingSeconds = Math.max(0, 40 * 60 - elapsedSeconds);
      return remainingSeconds;
    };

    setRemainingTime(getRemainingSeconds());

    const interval = setInterval(() => {
      const remaining = getRemainingSeconds();
      setRemainingTime(remaining);

      if (remaining === 0) {
        // handleBreakPress();
        // dispatch(clearBreakState());
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [breakStartTime, breakType]);

  return (
    <View style={styles.headContainer}>
      <Header
        onBackPress={() => navigation.goBack()}
        employeeName={StaffName.toUpperCase()}
        employeeId={EmpCode}
        designation={DesignationName}
        profilePhoto={ProfilePhoto}
      />
      <View style={styles.actionbuttonContainer}>
        <ActionButton
          title={loginTime ? 'Logout' : 'Login'}
          onPress={handleLoginLogout}
          backgroundColor={
            loginTime ? 'rgba(255, 0, 0, 1)' : 'rgb(28, 109, 208)'
          }
        />

        {loginTime && (
          <TouchableOpacity style={styles.logintimeContainer}>
            <Text style={styles.loginTime}>Login: {loginTime}</Text>
          </TouchableOpacity>
        )}
      </View>

      {loginTime && (
        <>
          <View style={styles.actionbuttonContainer}>
            <ActionButton
              title={isOnBreak ? 'Break-Out' : 'Break-In'}
              onPress={handleBreakPress}
              backgroundColor={
                isOnBreak ? 'rgba(255, 165, 0, 1)' : 'rgba(255, 193, 7, 1)'
              }
              disable={isBreakOutSubmitting}
            />
            {breakStartTime && (
              <TouchableOpacity style={styles.breaktimeContainer}>
                <Text
                  style={[styles.loginTime, {marginLeft: 0, fontSize: 14.3}]}>
                  BreakIn: {breakStartTime}
                </Text>
                {breakStartTime &&
                  breakType === 'LunchBreak' &&
                  remainingTime > 0 && (
                    <Text style={styles.timerText}>
                      {formatTimeFromSeconds(remainingTime)}
                    </Text>
                  )}
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
      <View style={{flex: 1}}>
        <ActiveLogs />
      </View>

      <Modal visible={reasonModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enter Reason</Text>
            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              placeholder="Reason for being late..."
              placeholderTextColor={'grey'}
            />
            <TouchableOpacity
              onPress={submitReason}
              disabled={isSubmitting || isBreakSubmitting}
              style={[
                styles.submitButton,
                (isSubmitting || isBreakSubmitting) && {opacity: 0.6},
              ]}>
              {isSubmitting || isBreakSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Submit</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={showBreakModal} transparent animationType="slide">
        <BreakModal
          onClose={() => setShowBreakModal(false)}
          onConfirm={handleBreakConfirm}
          disable={isBreakSubmitting}
        />
      </Modal>
    </View>
  );
};

export default Dashboard;
