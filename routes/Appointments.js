const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const { v4: uuidv4 } = require('uuid');

// Book a new appointment
router.post('/book', async (req, res) => {
    try {
        const {
            userId,
            userName,
            userEmail,
            service,
            dentist,
            date,
            time,
            notes = ''
        } = req.body;

        // Validation
        if (!userId || !userName || !userEmail || !service || !dentist || !date || !time) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }

        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format. Use YYYY-MM-DD'
            });
        }

        // Validate time format (HH:mm)
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(time)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid time format. Use HH:mm (24-hour)'
            });
        }

        // Check if appointment slot is available
        const existingAppointment = await Appointment.findOne({
            dentist,
            date,
            time,
            status: { $in: ['Pending', 'Confirmed'] }
        });

        if (existingAppointment) {
            return res.status(400).json({
                success: false,
                message: 'This time slot is already booked'
            });
        }

        // Check if dentist is available during working hours (8 AM - 5 PM)
        const hour = parseInt(time.split(':')[0]);
        if (hour < 8 || hour > 17 || (hour === 17 && parseInt(time.split(':')[1]) > 0)) {
            return res.status(400).json({
                success: false,
                message: 'Appointments can only be booked between 8:00 AM and 5:00 PM'
            });
        }

        // Check if date is in the past
        const selectedDate = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (selectedDate < today) {
            return res.status(400).json({
                success: false,
                message: 'Cannot book appointments for past dates'
            });
        }

        // Check if it's today and time is in the past
        if (selectedDate.toDateString() === today.toDateString()) {
            const currentTime = new Date();
            const appointmentTime = new Date(`${date}T${time}:00`);
            
            if (appointmentTime < currentTime) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot book appointments for past times today'
                });
            }
        }

        // Create new appointment
        const appointment = new Appointment({
            appointmentId: uuidv4(),
            userId,
            userName,
            userEmail,
            service,
            dentist,
            date,
            time,
            notes,
            status: 'Pending'
        });

        await appointment.save();

        res.status(201).json({
            success: true,
            message: 'Appointment booked successfully',
            appointment: {
                appointmentId: appointment.appointmentId,
                userId: appointment.userId,
                userName: appointment.userName,
                userEmail: appointment.userEmail,
                service: appointment.service,
                dentist: appointment.dentist,
                date: appointment.date,
                time: appointment.time,
                notes: appointment.notes,
                status: appointment.status,
                createdAt: appointment.createdAt
            }
        });

    } catch (error) {
        console.error('Book appointment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
});

// Get user's appointments
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { status } = req.query;

        let query = { userId };
        
        // Filter by status if provided
        if (status) {
            query.status = status;
        }

        const appointments = await Appointment.find(query)
            .sort({ date: -1, time: -1 });

        res.status(200).json({
            success: true,
            count: appointments.length,
            appointments
        });

    } catch (error) {
        console.error('Get appointments error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Get appointments by date and dentist
router.get('/availability', async (req, res) => {
    try {
        const { date, dentist } = req.query;

        if (!date || !dentist) {
            return res.status(400).json({
                success: false,
                message: 'Date and dentist are required'
            });
        }

        // Get all appointments for the given date and dentist
        const appointments = await Appointment.find({
            date,
            dentist,
            status: { $in: ['Pending', 'Confirmed'] }
        }).select('time');

        // Generate all possible time slots (8:00 AM to 5:00 PM, every 30 minutes)
        const allSlots = [];
        for (let hour = 8; hour <= 17; hour++) {
            for (let minute = 0; minute < 60; minute += 30) {
                if (hour === 17 && minute > 0) break; // No slots after 5:00 PM
                
                const timeSlot = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                allSlots.push(timeSlot);
            }
        }

        // Filter out booked slots
        const bookedTimes = appointments.map(app => app.time);
        const availableSlots = allSlots.filter(slot => !bookedTimes.includes(slot));

        // Check if date is in the past
        const selectedDate = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let isPastDate = false;
        if (selectedDate < today) {
            isPastDate = true;
            // If date is in the past, no slots are available
            availableSlots.length = 0;
        }

        res.status(200).json({
            success: true,
            date,
            dentist,
            availableSlots,
            totalSlots: allSlots.length,
            bookedSlots: bookedTimes.length,
            isPastDate
        });

    } catch (error) {
        console.error('Availability check error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Cancel an appointment
router.put('/cancel/:appointmentId', async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        const appointment = await Appointment.findOne({ appointmentId, userId });

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found or you do not have permission to cancel it'
            });
        }

        // Check if appointment can be cancelled (at least 24 hours before)
        const appointmentDate = new Date(appointment.date);
        const appointmentTime = appointment.time.split(':');
        appointmentDate.setHours(parseInt(appointmentTime[0]), parseInt(appointmentTime[1]));
        
        const now = new Date();
        const hoursDifference = (appointmentDate - now) / (1000 * 60 * 60);
        
        if (hoursDifference < 24) {
            return res.status(400).json({
                success: false,
                message: 'Appointments can only be cancelled at least 24 hours in advance'
            });
        }

        // Update appointment status
        appointment.status = 'Cancelled';
        appointment.updatedAt = new Date();
        await appointment.save();

        res.status(200).json({
            success: true,
            message: 'Appointment cancelled successfully'
        });

    } catch (error) {
        console.error('Cancel appointment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Update appointment
router.put('/:appointmentId', async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const { userId, date, time, service, dentist, notes } = req.body;

        const appointment = await Appointment.findOne({ appointmentId, userId });

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        // Check if new time slot is available (if date/time is being changed)
        if ((date && date !== appointment.date) || (time && time !== appointment.time) || 
            (dentist && dentist !== appointment.dentist)) {
            
            const checkDate = date || appointment.date;
            const checkTime = time || appointment.time;
            const checkDentist = dentist || appointment.dentist;

            const existingAppointment = await Appointment.findOne({
                dentist: checkDentist,
                date: checkDate,
                time: checkTime,
                appointmentId: { $ne: appointmentId }, // Exclude current appointment
                status: { $in: ['Pending', 'Confirmed'] }
            });

            if (existingAppointment) {
                return res.status(400).json({
                    success: false,
                    message: 'New time slot is already booked'
                });
            }
        }

        // Update appointment
        if (date) appointment.date = date;
        if (time) appointment.time = time;
        if (service) appointment.service = service;
        if (dentist) appointment.dentist = dentist;
        if (notes !== undefined) appointment.notes = notes;
        
        appointment.updatedAt = new Date();
        await appointment.save();

        res.status(200).json({
            success: true,
            message: 'Appointment updated successfully',
            appointment
        });

    } catch (error) {
        console.error('Update appointment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Get appointment by ID
router.get('/:appointmentId', async (req, res) => {
    try {
        const { appointmentId } = req.params;
        
        const appointment = await Appointment.findOne({ appointmentId });

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        res.status(200).json({
            success: true,
            appointment
        });

    } catch (error) {
        console.error('Get appointment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router;