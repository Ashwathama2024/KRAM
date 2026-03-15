from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, Float, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from ..database import Base


class DayTypeEnum(str, enum.Enum):
    WORKING = "working"
    WEEKEND = "weekend"
    HOLIDAY = "holiday"


class StatusEnum(str, enum.Enum):
    ASSIGNED = "assigned"
    PENDING = "pending"
    MODIFIED = "modified"
    VACANT = "vacant"


class AvailabilityTypeEnum(str, enum.Enum):
    LEAVE = "leave"
    OFFICIAL_DUTY = "official_duty"


class Staff(Base):
    __tablename__ = "staff"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    abbreviation = Column(String(12), nullable=False, default="")
    active = Column(Boolean, default=True)
    join_date = Column(Date, nullable=True)
    relieve_date = Column(Date, nullable=True)
    weekday_pointer = Column(Integer, default=0)
    holiday_pointer = Column(Integer, default=0)
    total_working_duties = Column(Integer, default=0)
    total_holiday_duties = Column(Integer, default=0)
    duty_debt = Column(Integer, default=0)
    working_debt = Column(Integer, default=0)
    holiday_debt = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    availability = relationship("Availability", back_populates="staff", cascade="all, delete-orphan")
    duty_assignments = relationship("Calendar", foreign_keys="Calendar.assigned_duty_id", back_populates="duty_staff")
    standby_assignments = relationship("Calendar", foreign_keys="Calendar.assigned_standby_id", back_populates="standby_staff")


class Calendar(Base):
    __tablename__ = "calendar"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, unique=True, index=True)
    day_type = Column(Enum(DayTypeEnum), nullable=False)
    is_holiday = Column(Boolean, default=False)
    holiday_name = Column(String(200), nullable=True)
    assigned_duty_id = Column(Integer, ForeignKey("staff.id"), nullable=True)
    assigned_standby_id = Column(Integer, ForeignKey("staff.id"), nullable=True)
    status = Column(Enum(StatusEnum), default=StatusEnum.PENDING)
    remarks = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    duty_staff = relationship("Staff", foreign_keys=[assigned_duty_id], back_populates="duty_assignments")
    standby_staff = relationship("Staff", foreign_keys=[assigned_standby_id], back_populates="standby_assignments")


class Availability(Base):
    __tablename__ = "availability"

    id = Column(Integer, primary_key=True, index=True)
    staff_id = Column(Integer, ForeignKey("staff.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    availability_type = Column(Enum(AvailabilityTypeEnum), nullable=False, default=AvailabilityTypeEnum.LEAVE)
    reason = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    staff = relationship("Staff", back_populates="availability")


class RosterSettings(Base):
    __tablename__ = "roster_settings"

    id = Column(Integer, primary_key=True, index=True)
    auto_assign_standby = Column(Boolean, default=True)
    separate_weekend_pool = Column(Boolean, default=True)
    gap_hours = Column(Integer, default=24)
    leave_rejoin_buffer_days = Column(Integer, default=2)
    official_duty_min_buffer_days = Column(Integer, default=2)
    official_duty_comfort_buffer_days = Column(Integer, default=4)
    comfort_unavailability_threshold = Column(Integer, default=12)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class RemarkLog(Base):
    __tablename__ = "remark_log"

    id = Column(Integer, primary_key=True, index=True)
    message = Column(Text, nullable=False)
    level = Column(String(20), default="info")
    date_ref = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SwapLog(Base):
    __tablename__ = "swap_log"

    id = Column(Integer, primary_key=True, index=True)
    first_date = Column(Date, nullable=False, index=True)
    second_date = Column(Date, nullable=False, index=True)
    first_staff_id_before = Column(Integer, ForeignKey("staff.id"), nullable=False)
    second_staff_id_before = Column(Integer, ForeignKey("staff.id"), nullable=False)
    first_staff_id_after = Column(Integer, ForeignKey("staff.id"), nullable=False)
    second_staff_id_after = Column(Integer, ForeignKey("staff.id"), nullable=False)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    first_staff_before = relationship("Staff", foreign_keys=[first_staff_id_before])
    second_staff_before = relationship("Staff", foreign_keys=[second_staff_id_before])
    first_staff_after = relationship("Staff", foreign_keys=[first_staff_id_after])
    second_staff_after = relationship("Staff", foreign_keys=[second_staff_id_after])
